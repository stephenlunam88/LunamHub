import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

test("MCP exposes the household calendar and chore tools with scoped OAuth metadata", async () => {
  process.env["DATABASE_URL"] ??=
    "postgresql://lunam:unused@127.0.0.1:5432/lunamhub";
  const { createLunamMcpServer } = await import("../src/lib/mcpOAuth.js");
  const auth: AuthInfo = {
    token: "test-token",
    clientId: "test-client",
    scopes: [
      "household:read",
      "calendar:read",
      "calendar:write",
      "chores:read",
      "chores:write",
    ],
    resource: new URL("https://lunamhub.swimforge.com.au/mcp"),
  };
  const server = createLunamMcpServer(auth);
  type ToolDefinition = Record<string, unknown>;
  type ToolListHandler = (
    request: unknown,
    extra: unknown,
  ) => Promise<{ tools: ToolDefinition[] }> | { tools: ToolDefinition[] };
  const handlers = (
    server.server as unknown as {
      _requestHandlers: Map<string, ToolListHandler>;
    }
  )._requestHandlers;
  const listTools = handlers.get("tools/list");
  assert.ok(listTools);
  const result = await listTools({ method: "tools/list", params: {} }, {});
  const byName = new Map(result.tools.map((tool) => [tool["name"], tool]));

  assert.deepEqual(
    [...byName.keys()].sort(),
    [
      "create_calendar_event",
      "create_chore",
      "get_profile",
      "list_calendar_events",
      "list_chores",
      "list_family_members",
    ].sort(),
  );
  assert.deepEqual(byName.get("create_calendar_event")?.["securitySchemes"], [
    { type: "oauth2", scopes: ["household:read", "calendar:write"] },
  ]);
  assert.deepEqual(byName.get("create_chore")?.["securitySchemes"], [
    { type: "oauth2", scopes: ["household:read", "chores:write"] },
  ]);
  assert.equal(
    (byName.get("get_profile")?.["_meta"] as Record<string, unknown>)?.[
      "openai/profile"
    ],
    true,
  );
  assert.equal(byName.get("get_profile")?.["outputSchema"] !== undefined, true);
  assert.equal(
    (
      byName.get("create_calendar_event")?.["annotations"] as Record<
        string,
        unknown
      >
    )?.["readOnlyHint"],
    false,
  );
  await server.close();
});
