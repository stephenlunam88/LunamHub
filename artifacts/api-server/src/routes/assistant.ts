import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createLunamMcpServer } from "../lib/mcpOAuth.js";
import { getAssistantConfig } from "../lib/assistantConfig";
import { needsCalendarLookupForRemoval } from "../lib/assistantIntent";

const router = Router();
const HISTORY_LIMIT = 30;
const MESSAGE_LIMIT = 4_000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const WRITE_TOOLS = new Set(["create_calendar_event", "create_chore"]);
const API_TOOL_NAME = "call_lunamhub_api";
const API_PREFIXES = [
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

const ApiRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
  path: z.string().min(1).max(180),
  query: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .refine(
      (values) =>
        Object.keys(values).length <= 20 &&
        Object.values(values).every(
          (value) => typeof value !== "string" || value.length <= 500,
        ),
    )
    .optional(),
  body: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length <= 50)
    .optional(),
});

const ChatBody = z.object({
  message: z.string().trim().min(1).max(MESSAGE_LIMIT),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MESSAGE_LIMIT),
      }),
    )
    .max(HISTORY_LIMIT)
    .default([]),
});

const ConfirmBody = z.object({ id: z.string().uuid() });

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type ChatMessage = Record<string, unknown>;
type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
type DisplayAction = ToolCall & { assignedNames?: string[] };

const apiTool = {
  type: "function",
  function: {
    name: API_TOOL_NAME,
    description:
      "Use LunamHub's authenticated API for household features: family members (/family), calendar (/events), chores and daily summaries (/chores), rewards and redemption requests (/rewards, /redemptions), shared lists and items (/lists/{id}/items), meals and meal plans (/meals, /meal-plan), routines and items/completions (/routines), dashboard (/dashboard/summary), badges (/badges), point transactions and milestones (/point-transactions, /point-milestones, /chore-milestones, /streak-milestones), leaderboards (/leaderboard), Games Night (/games-night/players, /games-night/games, /games-night/history, /games-night/results, /games-night/dashboard), and weather (/weather). Supported methods are GET, POST, PATCH, PUT, DELETE. Use paths that match the API, such as /events, /events/42, /chores/summary, /lists, /lists/2/items, /meal-plan, /routines/3/complete, /games-night/history, or /weather. Put path IDs directly in the path; use query for query parameters and body for JSON. Read first when an ID is needed. To remove an event, first use list_calendar_events to find the exact matching event, then prepare DELETE /events/{id}; never claim it is ready or removed without a matching write tool call. Every non-GET call will be shown for explicit confirmation before it runs. Never include passwords, PINs, tokens, avatar/photo content, or secrets. Do not use settings, authentication, Google Calendar connection, camera, or file-storage endpoints; those are intentionally unavailable to this assistant.",
    parameters: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PATCH", "PUT", "DELETE"],
        },
        path: { type: "string", maxLength: 180 },
        query: {
          type: "object",
          additionalProperties: { type: ["string", "number", "boolean"] },
        },
        body: { type: "object", additionalProperties: true },
      },
      required: ["method", "path"],
      additionalProperties: false,
    },
  },
};

async function ensureConfigured(res: import("express").Response) {
  const { apiKey, model } = await getAssistantConfig();
  if (!apiKey || !model) {
    res.status(503).json({
      error:
        "The LunamHub assistant is not configured yet. Add an OpenAI API key and model in Parent Area > Connections.",
    });
    return null;
  }
  return { apiKey, model };
}

async function withToolClient<T>(callback: (client: Client) => Promise<T>) {
  const auth: AuthInfo = {
    token: "lunamhub-internal-assistant",
    clientId: "lunamhub-mobile-assistant",
    scopes: [
      "household:read",
      "calendar:read",
      "calendar:write",
      "chores:read",
      "chores:write",
    ],
  };
  const server = createLunamMcpServer(auth);
  const client = new Client({
    name: "lunamhub-mobile-assistant",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  try {
    await client.connect(clientTransport);
    return await callback(client);
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

async function callOpenAI(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  tools: Array<Record<string, unknown>>,
  toolChoice:
    | "auto"
    | { type: "function"; function: { name: string } } = "auto",
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: toolChoice,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: OpenAIToolCall[] };
    }>;
  };
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? `OpenAI returned HTTP ${response.status}`,
    );
  }
  const message = result.choices?.[0]?.message;
  if (!message) throw new Error("The assistant returned an empty response.");
  return message;
}

function mcpResultText(result: unknown) {
  const value =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {};
  const content = Array.isArray(value["content"]) ? value["content"] : [];
  const text = content
    ?.filter(
      (item): item is { type: string; text?: string } =>
        !!item &&
        typeof item === "object" &&
        "type" in item &&
        (item as { type: string }).type === "text",
    )
    .map((item) => item.text ?? "")
    .join("\n");
  return value["isError"]
    ? `Tool error: ${text ?? "Unable to complete that action."}`
    : (text ?? "Done.");
}

async function callHouseholdApi(
  req: import("express").Request,
  input: unknown,
) {
  const parsed = ApiRequestSchema.safeParse(input);
  if (!parsed.success)
    return `Invalid API request: ${parsed.error.issues[0]?.message ?? "check the arguments"}`;
  const { method, path, query, body } = parsed.data;
  const normalizedPath = path.toLowerCase();
  if (
    !path.startsWith("/") ||
    path.includes("//") ||
    path.includes("%") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    path.split("/").some((segment) => segment === "." || segment === "..") ||
    !API_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return "That API path is not available to the household assistant.";
  }
  if (
    normalizedPath.startsWith("/events/google-calendar-") ||
    /^\/family\/\d+\/(avatar|set-pin|verify-pin)$/.test(normalizedPath)
  ) {
    return "That endpoint is intentionally unavailable to the assistant.";
  }
  const containsSensitiveField = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(containsSensitiveField);
    return Object.entries(value).some(
      ([key, child]) =>
        /^(pin|pinhash|password|token|secret)$/i.test(key) ||
        containsSensitiveField(child),
    );
  };
  if (containsSensitiveField(body)) {
    return "For safety, PINs, passwords, tokens, and secrets cannot be sent through chat. Use LunamHub's normal secure screen for that operation.";
  }
  if (body && JSON.stringify(body).length > 20_000) {
    return "That API payload is too large for a chat action. Use the normal LunamHub screen instead.";
  }

  const port = Number(process.env["PORT"] ?? 8080);
  const url = new URL(`/api${path}`, `http://127.0.0.1:${port}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
        ...(body && method !== "GET"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const text = (await response.text()).slice(0, 16_000);
    return `${response.ok ? "Success" : `HTTP ${response.status}`}${text ? `: ${text}` : "."}`;
  } catch (error) {
    return `API request failed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

async function continueTurn(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  client: Client,
  request: import("express").Request,
) {
  const forceCalendarLookup = needsCalendarLookupForRemoval(messages);
  const listed = await client.listTools();
  const tools: Array<Record<string, unknown>> = listed.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? tool.title ?? tool.name,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));
  tools.push(apiTool);
  const fullMessages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are the LunamHub family household assistant. Help with the whole household hub: calendar, chores, shared lists, meal planning, routines, rewards, family points and badges, Games Night, and weather.",
        `Today's date is ${new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date())}. Use Australia/Sydney local time.`,
        "For any question about what is on the calendar on a date or during a date range, you MUST call list_calendar_events for that exact inclusive date range before answering. Do not use the dashboard/household summary as a substitute for calendar data, and never say a day is free unless list_calendar_events successfully returned no events for that date. If the calendar lookup fails or is incomplete, say you could not verify the calendar rather than claiming it is empty. Include recurring event occurrences returned for the requested date.",
        "For creating calendar events or chores, use the dedicated create_calendar_event or create_chore tool, not call_lunamhub_api. For removing an event, first inspect the requested date with list_calendar_events; when there is a unique match, prepare DELETE /events/{id} with call_lunamhub_api so the app can show its confirmation controls. If there is no match or multiple plausible matches, explain that or ask which one; never claim a delete is ready without producing the pending write action. Before preparing a write for a named person, call list_family_members and use the matching ID; never ask the user for an internal member ID. Resolve relative dates such as today or tomorrow from the Australia/Sydney date above. Infer a clear, concise event title from the request (for example, 'Honor has swimming' means title 'Swimming' assigned to Honor). Ask a concise clarification only when an essential detail is genuinely ambiguous or missing; do not ask the user to reconfirm details they already stated or details you can look up. Do not claim changes are saved until the relevant tool succeeds.",
        "Every action that changes data requires confirmation through the app's Confirm/Cancel controls. When a write is ready, give only a short natural-language summary of what will change; do not ask for confirmation in chat or repeat implementation details such as endpoint names or internal IDs, because the app displays the pending action and confirmation controls. Never ask for or send a password, PIN, token, or secret in chat. If an operation requires one, direct the user to the normal LunamHub screen.",
      ].join(" "),
    },
    ...messages,
  ];
  let familyMembers: Array<{ id: number; name: string }> = [];
  const calendarEventIds = new Set<number>();

  // Read-only lookups can run immediately. Writes are held in the session and
  // only executed by the explicit confirmation endpoint.
  for (let turn = 0; turn < 5; turn++) {
    const toolChoice =
      turn === 0 && forceCalendarLookup
        ? {
            type: "function" as const,
            function: { name: "list_calendar_events" },
          }
        : turn === 1 && forceCalendarLookup
          ? {
              type: "function" as const,
              function: { name: API_TOOL_NAME },
            }
          : "auto";
    const answer = await callOpenAI(
      fullMessages,
      apiKey,
      model,
      tools,
      toolChoice,
    );
    const toolCalls = answer.tool_calls ?? [];
    if (!toolCalls.length) {
      return {
        text: answer.content?.trim() || "What would you like me to help with?",
        pending: null,
      };
    }
    fullMessages.push({
      role: "assistant",
      content: answer.content ?? null,
      tool_calls: toolCalls,
    });
    const writes: ToolCall[] = [];
    for (const call of toolCalls) {
      let args: Record<string, unknown>;
      try {
        const parsed = JSON.parse(call.function.arguments) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error();
        args = parsed as Record<string, unknown>;
      } catch {
        fullMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "Invalid tool arguments; ask the user to clarify.",
        });
        continue;
      }
      if (call.function.name === API_TOOL_NAME) {
        try {
          const input = ApiRequestSchema.parse(args);
          if (input.method !== "GET") {
            const eventPath = input.path.match(/^\/events\/(\d+)$/);
            const eventId = eventPath ? Number(eventPath[1]) : null;
            if (forceCalendarLookup && input.method !== "DELETE") {
              fullMessages.push({
                role: "tool",
                tool_call_id: call.id,
                content:
                  "This is a calendar removal request. Prepare a DELETE for the exact matching event from the calendar results; do not use another method or endpoint.",
              });
              continue;
            }
            if (
              forceCalendarLookup &&
              (!eventId || !calendarEventIds.has(eventId))
            ) {
              fullMessages.push({
                role: "tool",
                tool_call_id: call.id,
                content:
                  "That event was not in the calendar results just checked. Do not prepare a deletion; ask the user to clarify which event they mean.",
              });
              continue;
            }
            writes.push({
              id: call.id,
              name: call.function.name,
              arguments: args,
            });
            continue;
          }
          const result = await callHouseholdApi(request, input);
          fullMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
        } catch (error) {
          fullMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Invalid API request: ${error instanceof Error ? error.message : "check the arguments"}`,
          });
        }
      } else if (WRITE_TOOLS.has(call.function.name)) {
        writes.push({ id: call.id, name: call.function.name, arguments: args });
      } else {
        try {
          const result = await client.callTool({
            name: call.function.name,
            arguments: args,
          });
          const resultText = mcpResultText(result);
          fullMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: resultText,
          });
          if (call.function.name === "list_calendar_events") {
            try {
              const events = JSON.parse(resultText) as Array<{
                id?: unknown;
              }>;
              if (Array.isArray(events)) {
                for (const event of events) {
                  if (typeof event.id === "number")
                    calendarEventIds.add(event.id);
                }
              }
            } catch {
              calendarEventIds.clear();
            }
          }
          if (call.function.name === "list_family_members") {
            try {
              familyMembers = JSON.parse(mcpResultText(result)) as Array<{
                id: number;
                name: string;
              }>;
            } catch {
              familyMembers = [];
            }
          }
        } catch (error) {
          fullMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Tool error: ${error instanceof Error ? error.message : "Request failed"}`,
          });
        }
      }
    }
    if (writes.length) {
      return {
        text:
          answer.content?.trim() || "Please review and confirm this change.",
        pending: {
          messages: fullMessages,
          toolCalls: writes,
          displayActions: writes.map((call): DisplayAction => {
            const ids = Array.isArray(call.arguments["assignedMembers"])
              ? (call.arguments["assignedMembers"] as number[])
              : [
                  call.arguments["assignedTo"],
                  ...(Array.isArray(call.arguments["assignedToMany"])
                    ? (call.arguments["assignedToMany"] as number[])
                    : []),
                ].filter((id): id is number => typeof id === "number");
            const assignedNames = ids
              .map(
                (id) => familyMembers.find((member) => member.id === id)?.name,
              )
              .filter((name): name is string => Boolean(name));
            return {
              ...call,
              ...(assignedNames.length ? { assignedNames } : {}),
            };
          }),
        },
      };
    }
  }
  return {
    text: "I couldn't finish that request in one turn. Please try a more specific request.",
    pending: null,
  };
}

router.post("/chat", async (req, res) => {
  const configured = await ensureConfigured(res);
  if (!configured) return;
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Enter a message (up to 4,000 characters)." });
    return;
  }
  try {
    const messages: ChatMessage[] = [
      ...parsed.data.history.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      { role: "user", content: parsed.data.message },
    ];
    const result = await withToolClient((client) =>
      continueTurn(messages, configured.apiKey, configured.model, client, req),
    );
    let pending: {
      id: string;
      actions: Array<{
        name: string;
        arguments: Record<string, unknown>;
        assignedNames?: string[];
      }>;
    } | null = null;
    if (result.pending) {
      const id = randomUUID();
      req.session.assistantPending = {
        id,
        expiresAt: Date.now() + PENDING_TTL_MS,
        messages: result.pending.messages,
        toolCalls: result.pending.toolCalls,
        displayActions: result.pending.displayActions,
      };
      pending = {
        id,
        actions: result.pending.displayActions.map(
          ({ name, arguments: args, assignedNames }) => ({
            name,
            arguments: args,
            ...(assignedNames ? { assignedNames } : {}),
          }),
        ),
      };
      await new Promise<void>((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
    }
    res.json({ text: result.text, pending });
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error ? error.message : "Assistant request failed.",
    });
  }
});

router.post("/confirm", async (req, res) => {
  const configured = await ensureConfigured(res);
  if (!configured) return;
  const parsed = ConfirmBody.safeParse(req.body);
  const pending = req.session.assistantPending;
  if (
    !parsed.success ||
    !pending ||
    pending.id !== parsed.data.id ||
    pending.expiresAt < Date.now()
  ) {
    delete req.session.assistantPending;
    res
      .status(400)
      .json({ error: "That confirmation expired. Please ask again." });
    return;
  }
  delete req.session.assistantPending;
  try {
    const result = await withToolClient(async (client) => {
      const messages = pending.messages.map((message) => ({ ...message }));
      for (const call of pending.toolCalls) {
        if (call.name === API_TOOL_NAME) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: await callHouseholdApi(req, call.arguments),
          });
          continue;
        }
        try {
          const toolResult = await client.callTool({
            name: call.name,
            arguments: call.arguments,
          });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: mcpResultText(toolResult),
          });
        } catch (error) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Tool error: ${error instanceof Error ? error.message : "Request failed"}`,
          });
        }
      }
      return continueTurn(
        messages,
        configured.apiKey,
        configured.model,
        client,
        req,
      );
    });
    let nextPending: {
      id: string;
      actions: Array<{
        name: string;
        arguments: Record<string, unknown>;
        assignedNames?: string[];
      }>;
    } | null = null;
    if (result.pending) {
      const id = randomUUID();
      req.session.assistantPending = {
        id,
        expiresAt: Date.now() + PENDING_TTL_MS,
        messages: result.pending.messages,
        toolCalls: result.pending.toolCalls,
        displayActions: result.pending.displayActions,
      };
      nextPending = {
        id,
        actions: result.pending.displayActions.map(
          ({ name, arguments: args, assignedNames }) => ({
            name,
            arguments: args,
            ...(assignedNames ? { assignedNames } : {}),
          }),
        ),
      };
    }
    await new Promise<void>((resolve, reject) =>
      req.session.save((error) => (error ? reject(error) : resolve())),
    );
    res.json({ text: result.text, pending: nextPending });
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Couldn't complete the confirmed change.",
    });
  }
});

router.post(
  "/transcribe",
  (req, res, next) => {
    const contentType = req.header("content-type") ?? "";
    if (!/^audio\/(webm|mp4|ogg|wav|mpeg|aac)/i.test(contentType)) {
      res.status(415).json({ error: "Unsupported audio format." });
      return;
    }
    express.raw({ type: "audio/*", limit: "10mb" })(req, res, next);
  },
  async (req, res) => {
    const configured = await ensureConfigured(res);
    if (!configured) return;
    const { apiKey } = configured;
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Record a short voice message first." });
      return;
    }
    try {
      const contentType = req.header("content-type") ?? "audio/webm";
      const extension = contentType.includes("mp4")
        ? "m4a"
        : contentType.includes("ogg")
          ? "ogg"
          : "webm";
      const audio = new Blob([new Uint8Array(req.body)], { type: contentType });
      const form = new FormData();
      form.set("file", audio, `voice.${extension}`);
      form.set("model", "gpt-4o-mini-transcribe");
      form.set(
        "prompt",
        "Family calendar, appointments, chores, family member names, and Australian dates and times.",
      );
      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(45_000),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        text?: string;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          result.error?.message ?? `OpenAI returned HTTP ${response.status}`,
        );
      res.json({ text: result.text ?? "" });
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Voice transcription failed.",
      });
    }
  },
);

export default router;
