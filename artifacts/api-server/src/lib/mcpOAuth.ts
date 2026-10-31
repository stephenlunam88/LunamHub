import {
  createHash,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import type { Express, Response as ExpressResponse } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  eventsTable,
  eventMembersTable,
  familyMembersTable,
  choreTemplatesTable,
  choreTemplateChildrenTable,
} from "@workspace/db";
import { pool } from "@workspace/db";
import { createCalendarEvent } from "../routes/events.js";
import { createChoreRecords } from "../routes/chores.js";
import { normalizeAssistantApiRequest } from "./assistantApiRequest.js";
import {
  isLoginBlocked,
  clearLoginFailures,
  recordLoginFailure,
} from "./loginThrottle.js";
import { occursOn } from "./calendarRecurrence.js";

const SUPPORTED_SCOPES = [
  "household:read",
  "calendar:read",
  "calendar:write",
  "chores:read",
  "chores:write",
  "api:read",
  "api:write",
  "api:delete",
];
const HOUSEHOLD_API_PREFIXES = [
  "/family",
  "/events",
  "/chores",
  "/rewards",
  "/redemptions",
  "/lists",
  "/meals",
  "/meal-plan",
  "/routines",
  "/dashboard",
  "/badges",
  "/point-transactions",
  "/leaderboard",
  "/streak-milestones",
  "/point-milestones",
  "/chore-milestones",
  "/games-night",
  "/weather",
];
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const FLOW_TTL_SECONDS = 10 * 60;
const HASH = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const randomSecret = () => randomBytes(32).toString("base64url");
const McpApiPathSchema = z.string().min(1).max(180);
const McpApiQuerySchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .refine(
    (values) =>
      Object.keys(values).length <= 20 &&
      Object.values(values).every(
        (value) => typeof value !== "string" || value.length <= 500,
      ),
  )
  .optional();
const McpApiBodySchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 50)
  .optional();
let mcpApiSessionCookie: string | undefined;
let mcpApiSessionPromise: Promise<string> | undefined;

async function getMcpApiSessionCookie() {
  if (mcpApiSessionCookie) return mcpApiSessionCookie;
  if (mcpApiSessionPromise) return mcpApiSessionPromise;
  mcpApiSessionPromise = (async () => {
    const password = process.env["APP_PASSWORD"];
    if (!password) throw new Error("MCP API access requires APP_PASSWORD.");
    const port = Number(process.env["PORT"] ?? 8080);
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Proto": "https",
      },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error("Could not authenticate the MCP API request.");
    const cookie = response.headers
      .get("set-cookie")
      ?.match(/(?:^|,\s*)(lunam\.sid=[^;,]+)/)?.[1];
    if (!cookie) throw new Error("The API did not issue a session cookie.");
    mcpApiSessionCookie = cookie;
    return cookie;
  })();
  try {
    return await mcpApiSessionPromise;
  } finally {
    mcpApiSessionPromise = undefined;
  }
}

function containsSensitiveApiField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSensitiveApiField);
  return Object.entries(value).some(
    ([key, child]) =>
      /^(pin|pinhash|password|token|secret)$/i.test(key) ||
      containsSensitiveApiField(child),
  );
}

async function callMcpHouseholdApi(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  query?: Record<string, string | number | boolean>,
  body?: Record<string, unknown>,
) {
  const normalizedPath = path.toLowerCase();
  if (
    !path.startsWith("/") ||
    path.includes("//") ||
    path.includes("%") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    path.split("/").some((segment) => segment === "." || segment === "..") ||
    !HOUSEHOLD_API_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    ) ||
    normalizedPath.startsWith("/events/google-calendar-") ||
    /^\/family\/\d+\/(avatar|set-pin|verify-pin)$/.test(normalizedPath)
  ) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "That API path is not available to the MCP connection.",
        },
      ],
    };
  }
  if (containsSensitiveApiField(query)) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "For safety, credentials and secrets cannot be sent through MCP.",
        },
      ],
    };
  }
  const normalizedBody = normalizeAssistantApiRequest(method, path, body);
  if (containsSensitiveApiField(normalizedBody)) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "For safety, PINs, passwords, tokens, and secrets cannot be sent through MCP.",
        },
      ],
    };
  }
  if (normalizedBody && JSON.stringify(normalizedBody).length > 20_000) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "That API payload is too large for MCP.",
        },
      ],
    };
  }

  const port = Number(process.env["PORT"] ?? 8080);
  const url = new URL(`/api${path}`, `http://127.0.0.1:${port}`);
  for (const [key, value] of Object.entries(query ?? {}))
    url.searchParams.set(key, String(value));

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cookie = await getMcpApiSessionCookie();
      const response = await fetch(url, {
        method,
        headers: {
          Cookie: cookie,
          ...(normalizedBody && method !== "GET"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(normalizedBody && method !== "GET"
          ? { body: JSON.stringify(normalizedBody) }
          : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 401 && attempt === 0) {
        mcpApiSessionCookie = undefined;
        continue;
      }
      const responseText = (await response.text()).slice(0, 16_000);
      return {
        isError: !response.ok,
        content: [
          {
            type: "text" as const,
            text: `${response.ok ? "Success" : `HTTP ${response.status}`}${responseText ? `: ${responseText}` : "."}`,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `API request failed: ${error instanceof Error ? error.message : "unknown error"}`,
          },
        ],
      };
    }
  }
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: "API authentication expired. Retry the request.",
      },
    ],
  };
}
const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

function encryptionKey() {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is required for MCP OAuth");
  return createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string | undefined) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value: string | null) {
  if (!value) return undefined;
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted)
    throw new Error("Invalid encrypted OAuth client secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function publicBaseUrl() {
  const value =
    process.env["MCP_PUBLIC_URL"] ?? "https://lunamhub.swimforge.com.au";
  const url = new URL(value);
  if (process.env["NODE_ENV"] === "production" && url.protocol !== "https:") {
    throw new Error("MCP_PUBLIC_URL must use HTTPS in production");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export async function ensureMcpOAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      client_id text PRIMARY KEY,
      client jsonb NOT NULL,
      client_secret_enc text
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_flows (
      id text PRIMARY KEY,
      client_id text NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      state text,
      resource text,
      scopes text[] NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mcp_oauth_flows_expiry_idx ON mcp_oauth_flows(expires_at);
    CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
      code_hash text PRIMARY KEY,
      client_id text NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      resource text NOT NULL,
      scopes text[] NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
      token_hash text PRIMARY KEY,
      token_type text NOT NULL CHECK (token_type IN ('access', 'refresh')),
      family_id text NOT NULL,
      client_id text NOT NULL,
      resource text NOT NULL,
      scopes text[] NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_expiry_idx ON mcp_oauth_tokens(expires_at);
    CREATE TABLE IF NOT EXISTS mcp_oauth_profile (
      profile_key text PRIMARY KEY CHECK (profile_key = 'household'),
      profile_id uuid NOT NULL DEFAULT gen_random_uuid()
    );
    INSERT INTO mcp_oauth_profile (profile_key) VALUES ('household') ON CONFLICT DO NOTHING;
    DELETE FROM mcp_oauth_flows WHERE expires_at <= NOW();
    DELETE FROM mcp_oauth_codes WHERE expires_at <= NOW();
    DELETE FROM mcp_oauth_tokens WHERE expires_at <= NOW() - INTERVAL '30 days';
  `);
}

class LunamHubOAuthProvider implements OAuthServerProvider {
  readonly #base = publicBaseUrl();
  readonly #issuer = this.#base.href;
  readonly #resource = new URL("mcp", this.#base).href;

  get clientsStore() {
    return {
      getClient: async (
        clientId: string,
      ): Promise<OAuthClientInformationFull | undefined> => {
        const result = await pool.query<{
          client: OAuthClientInformationFull;
          client_secret_enc: string | null;
        }>(
          "SELECT client, client_secret_enc FROM mcp_oauth_clients WHERE client_id = $1",
          [clientId],
        );
        const row = result.rows[0];
        if (!row) return undefined;
        return {
          ...row.client,
          client_secret: decryptSecret(row.client_secret_enc),
        };
      },
      registerClient: async (
        input: Omit<
          OAuthClientInformationFull,
          "client_id" | "client_id_issued_at"
        >,
      ): Promise<OAuthClientInformationFull> => {
        const clientId = randomUUID();
        const client: OAuthClientInformationFull = {
          ...input,
          client_id: clientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        const { client_secret: clientSecret, ...publicClient } = client;
        await pool.query(
          "INSERT INTO mcp_oauth_clients (client_id, client, client_secret_enc) VALUES ($1, $2, $3)",
          [clientId, publicClient, encryptSecret(clientSecret)],
        );
        return client;
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: ExpressResponse,
  ) {
    const requestedScopes = params.scopes ?? [];
    const scopes = requestedScopes.length
      ? [...new Set(requestedScopes)]
      : [...SUPPORTED_SCOPES];
    if (scopes.some((scope) => !SUPPORTED_SCOPES.includes(scope)))
      throw new InvalidScopeError("Unsupported LunamHub permission requested");
    const resource = params.resource?.href;
    if (resource !== this.#resource)
      throw new InvalidTargetError("Invalid OAuth resource");
    const id = randomSecret();
    await pool.query(
      `INSERT INTO mcp_oauth_flows
        (id, client_id, redirect_uri, code_challenge, state, resource, scopes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + ($8 * INTERVAL '1 second'))`,
      [
        id,
        client.client_id,
        params.redirectUri,
        params.codeChallenge,
        params.state ?? null,
        resource,
        scopes,
        FLOW_TTL_SECONDS,
      ],
    );
    res.redirect(302, `/api/oauth/consent?flow=${encodeURIComponent(id)}`);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    const result = await pool.query<{ code_challenge: string }>(
      "SELECT code_challenge FROM mcp_oauth_codes WHERE code_hash = $1 AND client_id = $2 AND expires_at > NOW()",
      [HASH(code), client.client_id],
    );
    if (!result.rows[0])
      throw new InvalidGrantError("Invalid authorization code");
    return result.rows[0].code_challenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const result = await pool.query<{
      redirect_uri: string;
      resource: string;
      scopes: string[];
    }>(
      `DELETE FROM mcp_oauth_codes
       WHERE code_hash = $1 AND client_id = $2 AND expires_at > NOW()
       RETURNING redirect_uri, resource, scopes`,
      [HASH(code), client.client_id],
    );
    const grant = result.rows[0];
    if (
      !grant ||
      redirectUri !== grant.redirect_uri ||
      resource?.href !== grant.resource
    ) {
      throw new InvalidGrantError("Invalid authorization grant");
    }
    return this.#issueTokens(client.client_id, grant.resource, grant.scopes);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const result = await pool.query<{
      resource: string;
      scopes: string[];
      family_id: string;
    }>(
      `SELECT resource, scopes, family_id FROM mcp_oauth_tokens
       WHERE token_hash = $1 AND token_type = 'refresh' AND client_id = $2
         AND revoked_at IS NULL AND expires_at > NOW()`,
      [HASH(refreshToken), client.client_id],
    );
    const token = result.rows[0];
    const nextScopes = scopes?.length ? scopes : token?.scopes;
    if (
      !token ||
      !nextScopes ||
      nextScopes.some((scope) => !token.scopes.includes(scope)) ||
      resource?.href !== token.resource
    ) {
      throw new InvalidGrantError("Invalid refresh token");
    }
    const rotated = await pool.query(
      `UPDATE mcp_oauth_tokens SET revoked_at = NOW()
       WHERE token_hash = $1 AND token_type = 'refresh' AND client_id = $2
         AND revoked_at IS NULL AND expires_at > NOW()`,
      [HASH(refreshToken), client.client_id],
    );
    if (rotated.rowCount !== 1)
      throw new InvalidGrantError("Invalid refresh token");
    await pool.query(
      "UPDATE mcp_oauth_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL",
      [token.family_id],
    );
    return this.#issueTokens(client.client_id, token.resource, nextScopes);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const result = await pool.query<{
      client_id: string;
      resource: string;
      scopes: string[];
      expires_at: Date;
    }>(
      `SELECT client_id, resource, scopes, expires_at FROM mcp_oauth_tokens
       WHERE token_hash = $1 AND token_type = 'access' AND revoked_at IS NULL AND expires_at > NOW()`,
      [HASH(token)],
    );
    const row = result.rows[0];
    if (!row || row.resource !== this.#resource)
      throw new Error("Invalid access token");
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes,
      expiresAt: Math.floor(row.expires_at.getTime() / 1000),
      resource: new URL(row.resource),
      extra: { account: "household" },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    await pool.query(
      `UPDATE mcp_oauth_tokens SET revoked_at = NOW()
       WHERE family_id = (SELECT family_id FROM mcp_oauth_tokens WHERE token_hash = $1 AND client_id = $2)
         AND revoked_at IS NULL`,
      [HASH(request.token), client.client_id],
    );
  }

  async approveFlow(flowId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const flowResult = await client.query<{
        client_id: string;
        redirect_uri: string;
        code_challenge: string;
        state: string | null;
        resource: string;
        scopes: string[];
      }>(
        `DELETE FROM mcp_oauth_flows WHERE id = $1 AND expires_at > NOW()
         RETURNING client_id, redirect_uri, code_challenge, state, resource, scopes`,
        [flowId],
      );
      const flow = flowResult.rows[0];
      if (!flow)
        throw new Error(
          "This authorization request expired. Start again from ChatGPT.",
        );
      const code = randomSecret();
      await client.query(
        `INSERT INTO mcp_oauth_codes
          (code_hash, client_id, redirect_uri, code_challenge, resource, scopes, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW() + INTERVAL '5 minutes')`,
        [
          HASH(code),
          flow.client_id,
          flow.redirect_uri,
          flow.code_challenge,
          flow.resource,
          flow.scopes,
        ],
      );
      await client.query("COMMIT");
      const redirect = new URL(flow.redirect_uri);
      redirect.searchParams.set("code", code);
      if (flow.state) redirect.searchParams.set("state", flow.state);
      return redirect.href;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async denyFlow(flowId: string) {
    const result = await pool.query<{
      redirect_uri: string;
      state: string | null;
    }>(
      "DELETE FROM mcp_oauth_flows WHERE id = $1 AND expires_at > NOW() RETURNING redirect_uri, state",
      [flowId],
    );
    const flow = result.rows[0];
    if (!flow)
      throw new Error(
        "This authorization request expired. Start again from ChatGPT.",
      );
    const redirect = new URL(flow.redirect_uri);
    redirect.searchParams.set("error", "access_denied");
    if (flow.state) redirect.searchParams.set("state", flow.state);
    return redirect.href;
  }

  async getFlow(flowId: string) {
    const result = await pool.query<{ client_id: string; scopes: string[] }>(
      "SELECT client_id, scopes FROM mcp_oauth_flows WHERE id = $1 AND expires_at > NOW()",
      [flowId],
    );
    const flow = result.rows[0];
    if (!flow) return undefined;
    const client = await this.clientsStore.getClient(flow.client_id);
    return {
      clientName: client?.client_name ?? "ChatGPT",
      scopes: flow.scopes,
    };
  }

  async #issueTokens(
    clientId: string,
    resource: string,
    scopes: string[],
  ): Promise<OAuthTokens> {
    const accessToken = randomSecret();
    const refreshToken = randomSecret();
    const familyId = randomUUID();
    await pool.query(
      `INSERT INTO mcp_oauth_tokens (token_hash, token_type, family_id, client_id, resource, scopes, expires_at)
       VALUES ($1,'access',$2,$3,$4,$5,NOW() + ($6 * INTERVAL '1 second')),
              ($7,'refresh',$2,$3,$4,$5,NOW() + ($8 * INTERVAL '1 second'))`,
      [
        HASH(accessToken),
        familyId,
        clientId,
        resource,
        scopes,
        ACCESS_TOKEN_TTL_SECONDS,
        HASH(refreshToken),
        REFRESH_TOKEN_TTL_SECONDS,
      ],
    );
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: scopes.join(" "),
      issuer: this.#issuer,
    };
  }
}

const provider = new LunamHubOAuthProvider();

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

function consentPage(
  flowId: string,
  clientName: string,
  scopes: string[],
  hasSession: boolean,
) {
  const names: Record<string, string> = {
    "household:read":
      "View family member names for assigning events and chores",
    "calendar:read": "View family calendar events and attendees",
    "calendar:write": "Add events to the family calendar",
    "chores:read": "View family chore templates",
    "chores:write": "Add family chores",
    "api:read": "Read household data across LunamHub features",
    "api:write": "Create or update household data across LunamHub features",
    "api:delete": "Delete household data across LunamHub features",
  };
  const scopeRows = scopes
    .map((scope) => `<li>${escapeHtml(names[scope] ?? scope)}</li>`)
    .join("");
  const password = hasSession
    ? ""
    : '<label>Household password<input type="password" name="password" autocomplete="current-password" required></label>';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect LunamHub</title><style>body{font:16px system-ui;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#172033}main{border:1px solid #d8deea;border-radius:1rem;padding:2rem}li{margin:.7rem 0}label{display:block;margin:1rem 0}input{display:block;width:100%;box-sizing:border-box;padding:.8rem;margin-top:.5rem}button{padding:.8rem 1rem;border:0;border-radius:.6rem;background:#2587df;color:white;font-weight:600}button[name=decision][value=deny]{background:#e8edf4;color:#172033;margin-left:.5rem}</style><main><h1>Connect LunamHub</h1><p><strong>${escapeHtml(clientName)}</strong> is requesting access to your household:</p><ul>${scopeRows}</ul><form method="post" action="/api/oauth/consent"><input type="hidden" name="flow" value="${escapeHtml(flowId)}">${password}<button name="decision" value="approve">Approve</button><button name="decision" value="deny">Cancel</button></form><p>You can disconnect ChatGPT from LunamHub at any time by revoking its access.</p></main></html>`;
}

function safeEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function mountMcpIntegration(app: Express) {
  const appPassword = process.env["APP_PASSWORD"];
  if (!appPassword) {
    // Fail closed: never publish private family tools without a household login password.
    app.all("/mcp", (_req, res) =>
      res
        .status(503)
        .json({ error: "MCP requires APP_PASSWORD to be configured." }),
    );
    return;
  }

  const baseUrl = publicBaseUrl();
  const resourceUrl = new URL("mcp", baseUrl);
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: baseUrl,
      resourceServerUrl: resourceUrl,
      scopesSupported: SUPPORTED_SCOPES,
      resourceName: "LunamHub household APIs",
    }),
  );

  app.get("/api/oauth/consent", async (req, res) => {
    const flowId =
      typeof req.query["flow"] === "string" ? req.query["flow"] : "";
    const flow = await provider.getFlow(flowId);
    if (!flow) {
      res
        .status(400)
        .type("text/plain")
        .send("Authorization request expired. Start again from ChatGPT.");
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res
      .type("html")
      .send(
        consentPage(
          flowId,
          flow.clientName,
          flow.scopes,
          req.session.authenticated === true,
        ),
      );
  });

  app.post("/api/oauth/consent", async (req, res) => {
    const flowId = typeof req.body?.flow === "string" ? req.body.flow : "";
    const decision = req.body?.decision;
    const flow = await provider.getFlow(flowId);
    if (!flow) {
      res
        .status(400)
        .type("text/plain")
        .send("Authorization request expired. Start again from ChatGPT.");
      return;
    }
    if (decision === "deny") {
      res.redirect(302, await provider.denyFlow(flowId));
      return;
    }
    if (decision !== "approve") {
      res.status(400).type("text/plain").send("Invalid authorization choice.");
      return;
    }
    const loginKey = `mcp:${req.ip}`;
    if (req.session.authenticated !== true) {
      if (isLoginBlocked(loginKey)) {
        res
          .status(429)
          .type("text/plain")
          .send("Too many attempts. Try again later.");
        return;
      }
      const supplied =
        typeof req.body?.password === "string" ? req.body.password : "";
      if (!safeEqual(supplied, appPassword)) {
        recordLoginFailure(loginKey);
        res
          .status(401)
          .type("html")
          .send(
            consentPage(flowId, flow.clientName, flow.scopes, false).replace(
              "<main>",
              "<main><p role=alert>Incorrect password. Please try again.</p>",
            ),
          );
        return;
      }
      clearLoginFailures(loginKey);
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      req.session.authenticated = true;
      await new Promise<void>((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
    }
    res.redirect(302, await provider.approveFlow(flowId));
  });

  app.all("/mcp", async (req, res) => {
    const authHeader = req.header("authorization") ?? "";
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${new URL(".well-known/oauth-protected-resource/mcp", baseUrl).href}"`,
      );
      res.status(401).json({ error: "OAuth access token required." });
      return;
    }
    let authInfo: AuthInfo;
    try {
      authInfo = await provider.verifyAccessToken(token);
    } catch {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${new URL(".well-known/oauth-protected-resource/mcp", baseUrl).href}"`,
      );
      res.status(401).json({ error: "Invalid or expired OAuth access token." });
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.sendStatus(405);
      return;
    }
    const server = createLunamMcpServer(authInfo);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
}

function needsScope(scope: string) {
  const metadataUrl = new URL(
    ".well-known/oauth-protected-resource/mcp",
    publicBaseUrl(),
  ).href;
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `This connection needs the ${scope} permission. Reconnect LunamHub in ChatGPT and approve the requested access.`,
      },
    ],
    _meta: {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${metadataUrl}", error="insufficient_scope", error_description="The ${scope} permission is required."`,
      ],
    },
  };
}

export function createLunamMcpServer(auth: AuthInfo) {
  const server = new McpServer(
    { name: "lunamhub", version: "1.0.0" },
    {
      // MCP inputs contain only small scalar fields and bounded assignment
      // arrays. Keep pathological object/array payloads from consuming memory.
      maxToolInputElements: 100,
      instructions:
        "You manage the connected LunamHub household across its API: family, calendar, chores, lists, meals, routines, rewards, points, badges, Games Night, dashboard, and weather. Use the read_lunamhub_api, write_lunamhub_api, and delete_lunamhub_api tools only for those household features; authentication, settings, secrets, uploads, and external account connections are unavailable. Resolve IDs with read tools first. Do not make changes without a clear user request. Before deleting, identify the exact item; ask if ambiguous. A recurring calendar event may represent an entire series, so distinguish deleting one occurrence from deleting the full series. Never send passwords, PINs, tokens, or secrets.",
    },
  );

  server.registerTool(
    "list_family_members",
    {
      title: "List family members",
      description:
        "List household members and stable IDs for assigning calendar events or chores.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      if (!auth.scopes.includes("household:read"))
        return needsScope("household:read");
      const members = await db
        .select({
          id: familyMembersTable.id,
          name: familyMembersTable.name,
          role: familyMembersTable.role,
          color: familyMembersTable.color,
        })
        .from(familyMembersTable)
        .orderBy(asc(familyMembersTable.id));
      return { content: [{ type: "text", text: JSON.stringify(members) }] };
    },
  );

  server.registerTool(
    "get_profile",
    {
      title: "Get connected household",
      description:
        "Identify the shared LunamHub household connected to this ChatGPT account.",
      outputSchema: { id: z.string().min(1), name: z.string() },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { "openai/profile": true },
    },
    async () => {
      if (!auth.scopes.includes("household:read"))
        return needsScope("household:read");
      const result = await pool.query<{ profile_id: string }>(
        "SELECT profile_id FROM mcp_oauth_profile WHERE profile_key = 'household'",
      );
      const profileId = result.rows[0]?.profile_id;
      if (!profileId) throw new Error("Household profile is unavailable.");
      const profile = { id: profileId, name: "LunamHub Household" };
      return {
        structuredContent: profile,
        content: [{ type: "text", text: JSON.stringify(profile) }],
      };
    },
  );

  server.registerTool(
    "list_calendar_events",
    {
      title: "List calendar events",
      description:
        "List LunamHub calendar events between inclusive YYYY-MM-DD dates. Limit the range to 90 days. Optional memberId filters to events assigned to that family member.",
      inputSchema: {
        startDate: z
          .string()
          .refine(isCalendarDate, "Use a real date in YYYY-MM-DD format."),
        endDate: z
          .string()
          .refine(isCalendarDate, "Use a real date in YYYY-MM-DD format."),
        memberId: z.number().int().positive().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ startDate, endDate, memberId }) => {
      if (!auth.scopes.includes("calendar:read"))
        return needsScope("calendar:read");
      if (
        startDate > endDate ||
        Date.parse(`${endDate}T00:00:00Z`) -
          Date.parse(`${startDate}T00:00:00Z`) >
          90 * 86400000
      )
        throw new Error("Choose a valid date range of at most 90 days.");
      const events = await db
        .select()
        .from(eventsTable)
        .where(
          or(
            and(
              isNull(eventsTable.recurrence),
              gte(eventsTable.date, startDate),
              lte(eventsTable.date, endDate),
            ),
            and(
              isNotNull(eventsTable.recurrence),
              lte(eventsTable.date, endDate),
              or(
                isNull(eventsTable.recurrenceEndDate),
                gte(eventsTable.recurrenceEndDate, startDate),
              ),
            ),
          ),
        )
        .orderBy(
          asc(eventsTable.date),
          sql`${eventsTable.startTime} ASC NULLS LAST`,
          asc(eventsTable.id),
        );
      const memberRows = events.length
        ? await db
            .select()
            .from(eventMembersTable)
            .where(
              inArray(
                eventMembersTable.eventId,
                events.map((event) => event.id),
              ),
            )
        : [];
      const byEvent = new Map<number, number[]>();
      for (const row of memberRows)
        byEvent.set(row.eventId, [
          ...(byEvent.get(row.eventId) ?? []),
          row.memberId,
        ]);
      const result = events
        .flatMap((event) => {
          const assignedMembers = byEvent.get(event.id) ?? [];
          if (memberId !== undefined && !assignedMembers.includes(memberId))
            return [];
          const occurrences: string[] = [];
          const start = new Date(`${startDate}T00:00:00Z`);
          const finish = new Date(`${endDate}T00:00:00Z`);
          for (
            let day = start;
            day <= finish;
            day = new Date(day.getTime() + 86400000)
          ) {
            const date = day.toISOString().slice(0, 10);
            if (occursOn(event, date)) occurrences.push(date);
          }
          return occurrences.map((date) => ({
            id: event.id,
            title: event.title,
            description: event.description,
            location: event.location,
            date,
            startTime: event.startTime,
            endTime: event.endTime,
            allDay: event.allDay,
            category: event.category,
            recurrence: event.recurrence,
            seriesStartDate: event.date,
            assignedMembers,
          }));
        })
        .sort(
          (left, right) =>
            left.date.localeCompare(right.date) ||
            (left.startTime ?? "99:99").localeCompare(
              right.startTime ?? "99:99",
            ) ||
            left.id - right.id,
        );
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "create_calendar_event",
    {
      title: "Add a calendar event",
      description:
        "Create a family calendar event. Dates are YYYY-MM-DD and times are 24-hour HH:mm. Use list_family_members to resolve assignees. LunamHub syncs the event to Google Calendar when connected. Ask the user to clarify missing or ambiguous details before calling.",
      inputSchema: {
        title: z.string().min(1).max(200),
        date: z
          .string()
          .refine(isCalendarDate, "Use a real date in YYYY-MM-DD format."),
        startTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(),
        endTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(),
        allDay: z.boolean().optional(),
        description: z.string().max(2000).optional(),
        location: z.string().max(500).optional(),
        category: z
          .enum([
            "school",
            "sport",
            "appointment",
            "birthday",
            "family",
            "other",
          ])
          .default("other"),
        assignedMembers: z
          .array(z.number().int().positive())
          .max(20)
          .optional(),
        recurrence: z
          .enum(["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "YEARLY"])
          .optional(),
        recurrenceEndDate: z
          .string()
          .refine(isCalendarDate, "Use a real date in YYYY-MM-DD format.")
          .optional(),
        recurrenceDays: z
          .string()
          .regex(/^[0-6](,[0-6])*$/)
          .optional(),
        recurrenceExceptions: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})*$/)
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      if (!auth.scopes.includes("household:read"))
        return needsScope("household:read");
      if (!auth.scopes.includes("calendar:write"))
        return needsScope("calendar:write");
      const toMinutes = (time: string) =>
        Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      if (
        input.startTime &&
        input.endTime &&
        toMinutes(input.endTime) <= toMinutes(input.startTime)
      )
        throw new Error(
          "Event end time must be after its start time on the same day.",
        );
      if (input.recurrenceEndDate && input.recurrenceEndDate < input.date)
        throw new Error(
          "Recurrence end date cannot be earlier than the event date.",
        );
      if (input.assignedMembers?.length) {
        const matched = await db
          .select({ id: familyMembersTable.id })
          .from(familyMembersTable)
          .where(inArray(familyMembersTable.id, input.assignedMembers));
        if (matched.length !== new Set(input.assignedMembers).size)
          throw new Error(
            "One or more assigned family member IDs do not exist.",
          );
      }
      const event = await createCalendarEvent(input);
      return { content: [{ type: "text", text: JSON.stringify(event) }] };
    },
  );

  server.registerTool(
    "list_chores",
    {
      title: "List chore templates",
      description:
        "List active household chore templates and recurrence settings.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      if (!auth.scopes.includes("chores:read"))
        return needsScope("chores:read");
      const chores = await db
        .select({
          id: choreTemplatesTable.id,
          title: choreTemplatesTable.title,
          description: choreTemplatesTable.description,
          pointsValue: choreTemplatesTable.pointsValue,
          repeatType: choreTemplatesTable.repeatType,
          daysOfWeek: choreTemplatesTable.daysOfWeek,
          duePeriod: choreTemplatesTable.duePeriod,
          active: choreTemplatesTable.active,
        })
        .from(choreTemplatesTable)
        .where(eq(choreTemplatesTable.active, true))
        .orderBy(asc(choreTemplatesTable.id));
      const assignments = chores.length
        ? await db
            .select()
            .from(choreTemplateChildrenTable)
            .where(
              inArray(
                choreTemplateChildrenTable.templateId,
                chores.map((chore) => chore.id),
              ),
            )
        : [];
      const membersByTemplate = new Map<number, number[]>();
      for (const assignment of assignments)
        membersByTemplate.set(assignment.templateId, [
          ...(membersByTemplate.get(assignment.templateId) ?? []),
          assignment.childId,
        ]);
      const result = chores.map((chore) => ({
        ...chore,
        assignedTo: membersByTemplate.get(chore.id) ?? [],
      }));
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "create_chore",
    {
      title: "Add a chore",
      description:
        "Create a family chore. Use a family member ID to assign it. repeatType is once, daily, or weekly; daysOfWeek uses 0=Sunday through 6=Saturday; duePeriod is an optional morning, afternoon, or evening bucket (not a clock-time deadline). Ask for missing or ambiguous details before creating.",
      inputSchema: {
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        assignedTo: z.number().int().positive().optional(),
        assignedToMany: z.array(z.number().int().positive()).max(20).optional(),
        dueDate: z
          .string()
          .refine(isCalendarDate, "Use a real date in YYYY-MM-DD format.")
          .optional(),
        repeatType: z.enum(["once", "daily", "weekly"]),
        pointsValue: z.number().int().min(0).max(10000).default(10),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        duePeriod: z
          .enum(["morning", "afternoon", "evening"])
          .nullable()
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      if (!auth.scopes.includes("household:read"))
        return needsScope("household:read");
      if (!auth.scopes.includes("chores:write"))
        return needsScope("chores:write");
      const assignedIds = [
        ...new Set([
          ...(input.assignedTo ? [input.assignedTo] : []),
          ...(input.assignedToMany ?? []),
        ]),
      ];
      if (input.assignedTo && input.assignedToMany?.length)
        throw new Error("Choose assignedTo or assignedToMany, not both.");
      if (assignedIds.length) {
        const members = await db
          .select({ id: familyMembersTable.id })
          .from(familyMembersTable)
          .where(inArray(familyMembersTable.id, assignedIds));
        if (members.length !== assignedIds.length)
          throw new Error("One or more assigned family members do not exist.");
      }
      if (input.repeatType === "weekly" && !input.daysOfWeek?.length)
        throw new Error("For weekly chores, provide at least one dayOfWeek.");
      const chore = await createChoreRecords({
        ...input,
        assignedToMany: input.assignedToMany
          ? [...new Set(input.assignedToMany)]
          : undefined,
        daysOfWeek: input.daysOfWeek
          ? [...new Set(input.daysOfWeek)]
          : undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(chore) }] };
    },
  );

  server.registerTool(
    "read_lunamhub_api",
    {
      title: "Read LunamHub household data",
      description:
        "Read household data from LunamHub's supported APIs: family, calendar, chores, rewards, redemptions, lists, meals, meal plans, routines, dashboard, badges, points, leaderboards, Games Night, and weather. Use an API path such as /events, /chores/summary, /lists/2/items, /meal-plan, /games-night/history, or /weather. Path IDs go in the path; query values go in query. Do not use authentication, settings, Google account connection, camera, or file-storage paths.",
      inputSchema: {
        path: McpApiPathSchema,
        query: McpApiQuerySchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ path, query }) => {
      if (!auth.scopes.includes("api:read")) return needsScope("api:read");
      return callMcpHouseholdApi("GET", path, query);
    },
  );

  server.registerTool(
    "write_lunamhub_api",
    {
      title: "Create or update LunamHub data",
      description:
        'Create or update household data through LunamHub\'s supported APIs. method must be POST, PATCH, or PUT. Supply a supported API path, optional query, and JSON body. Create a todo or reminders list with POST /lists and body {name, category: "reminders"}; other categories are grocery, packing, school, and other (default). Add a task or item with POST /lists/{listId}/items and body {text}; complete it with PATCH /lists/{listId}/items/{itemId} and body {completed: true}. This executes the change when called, so only call it after the user clearly requests that change. Never use it for DELETE; use delete_lunamhub_api instead. Do not use authentication, settings, Google account connection, camera, or file-storage paths.',
      inputSchema: {
        method: z.enum(["POST", "PATCH", "PUT"]),
        path: McpApiPathSchema,
        query: McpApiQuerySchema,
        body: McpApiBodySchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ method, path, query, body }) => {
      if (!auth.scopes.includes("api:write")) return needsScope("api:write");
      return callMcpHouseholdApi(method, path, query, body);
    },
  );

  server.registerTool(
    "delete_lunamhub_api",
    {
      title: "Delete LunamHub household data",
      description:
        "Delete a specific household item through LunamHub's supported APIs. Only call after the user clearly asks to delete/remove the identified item; if more than one match exists, ask which one. For a recurring calendar event, clarify whether they mean one occurrence or the entire series. Delete an entire list and its items with /lists/{listId}; delete only one item with /lists/{listId}/items/{itemId}. Other examples: /events/42, /chores/12, or /meals/4. Resolve IDs from current read results before deleting. Deletion happens immediately when called. Do not use authentication, settings, Google account connection, camera, or file-storage paths.",
      inputSchema: {
        path: McpApiPathSchema,
        query: McpApiQuerySchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ path, query }) => {
      if (!auth.scopes.includes("api:delete")) return needsScope("api:delete");
      return callMcpHouseholdApi("DELETE", path, query);
    },
  );

  // The official MCP SDK currently passes through _meta but doesn't model
  // OpenAI's top-level per-tool OAuth extension, so add it to tools/list.
  type ListedTool = { name: string; [key: string]: unknown };
  type ToolList = { tools: ListedTool[]; [key: string]: unknown };
  type ListHandler = (
    request: unknown,
    extra: unknown,
  ) => Promise<ToolList> | ToolList;
  const handlerMap = (
    server.server as unknown as { _requestHandlers: Map<string, ListHandler> }
  )._requestHandlers;
  const defaultListHandler = handlerMap.get("tools/list");
  if (defaultListHandler) {
    server.server.setRequestHandler(
      ListToolsRequestSchema,
      async (request, extra) => {
        const result = await defaultListHandler(request, extra);
        const scopesByTool: Record<string, string[]> = {
          get_profile: ["household:read"],
          list_family_members: ["household:read"],
          list_calendar_events: ["calendar:read"],
          create_calendar_event: ["household:read", "calendar:write"],
          list_chores: ["chores:read"],
          create_chore: ["household:read", "chores:write"],
          read_lunamhub_api: ["api:read"],
          write_lunamhub_api: ["api:write"],
          delete_lunamhub_api: ["api:delete"],
        };
        return {
          ...result,
          tools: result.tools.map((tool) => ({
            ...tool,
            securitySchemes: [
              { type: "oauth2", scopes: scopesByTool[tool.name] ?? [] },
            ],
          })),
        };
      },
    );
  }

  return server;
}
