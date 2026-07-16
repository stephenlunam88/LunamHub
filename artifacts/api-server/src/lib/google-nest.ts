import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SDM_BASE = "https://smartdevicemanagement.googleapis.com/v1";
const TOKEN_BUFFER_MS = 5 * 60_000;

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let tableReady: Promise<void> | null = null;

export type NestConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  projectId: string;
};

export function getNestConfig(): NestConfig | null {
  const clientId =
    process.env.NEST_OAUTH_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret =
    process.env.NEST_OAUTH_CLIENT_SECRET ??
    process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.NEST_OAUTH_REDIRECT_URI;
  const projectId = process.env.NEST_DEVICE_ACCESS_PROJECT_ID;
  if (!clientId || !clientSecret || !redirectUri || !projectId) return null;
  return { clientId, clientSecret, redirectUri, projectId };
}

async function ensureTable(): Promise<void> {
  tableReady ??= db
    .execute(sql`
      CREATE TABLE IF NOT EXISTS google_nest_connections (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        refresh_token TEXT NOT NULL,
        connected_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
    .then(() => undefined);
  return tableReady;
}

export async function storeNestRefreshToken(token: string): Promise<void> {
  await ensureTable();
  await db.execute(sql`
    INSERT INTO google_nest_connections (id, refresh_token)
    VALUES (1, ${token})
    ON CONFLICT (id) DO UPDATE
      SET refresh_token = EXCLUDED.refresh_token, connected_at = NOW()
  `);
  accessToken = null;
  accessTokenExpiresAt = 0;
}

async function getRefreshToken(): Promise<string | null> {
  await ensureTable();
  const result = await db.execute<{ refresh_token: string }>(
    sql`SELECT refresh_token FROM google_nest_connections WHERE id = 1`,
  );
  return result.rows[0]?.refresh_token ?? null;
}

export async function disconnectNest(): Promise<void> {
  await ensureTable();
  await db.execute(sql`DELETE FROM google_nest_connections WHERE id = 1`);
  accessToken = null;
  accessTokenExpiresAt = 0;
}

async function getAccessToken(): Promise<string | null> {
  if (
    accessToken &&
    Date.now() < accessTokenExpiresAt - TOKEN_BUFFER_MS
  ) {
    return accessToken;
  }
  const config = getNestConfig();
  const refreshToken = await getRefreshToken();
  if (!config || !refreshToken) return null;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !data.access_token) {
    logger.warn({ status: response.status, error: data.error }, "nest: token refresh failed");
    return null;
  }
  accessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return accessToken;
}

export async function nestRequest(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await fetch(`${SDM_BASE}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    logger.warn({ error, path }, "nest: SDM request failed");
    return null;
  }
}

export async function isNestConnected(): Promise<boolean> {
  const config = getNestConfig();
  if (!config) return false;
  const response = await nestRequest(
    `/enterprises/${encodeURIComponent(config.projectId)}/devices`,
  );
  return Boolean(response?.ok);
}
