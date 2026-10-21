import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
      "api:read",
      "api:write",
      "api:delete",
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
      "read_lunamhub_api",
      "write_lunamhub_api",
      "delete_lunamhub_api",
    ].sort(),
  );
  assert.deepEqual(byName.get("create_calendar_event")?.["securitySchemes"], [
    { type: "oauth2", scopes: ["household:read", "calendar:write"] },
  ]);
  assert.deepEqual(byName.get("create_chore")?.["securitySchemes"], [
    { type: "oauth2", scopes: ["household:read", "chores:write"] },
  ]);
  assert.deepEqual(byName.get("read_lunamhub_api")?.["securitySchemes"], [
    { type: "oauth2", scopes: ["api:read"] },
  ]);
  assert.deepEqual(byName.get("write_lunamhub_api")?.["securitySchemes"], [
    { type: "oauth2", scopes: ["api:write"] },
  ]);
  assert.deepEqual(byName.get("delete_lunamhub_api")?.["securitySchemes"], [
    { type: "oauth2", scopes: ["api:delete"] },
  ]);
  assert.equal(
    (
      byName.get("delete_lunamhub_api")?.["annotations"] as Record<
        string,
        unknown
      >
    )?.["destructiveHint"],
    true,
  );
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
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "test-lunamhub-assistant",
    version: "1.0.0",
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const wireTools = await client.listTools();
  assert.deepEqual(
    wireTools.tools.map((tool) => tool.name).sort(),
    [...byName.keys()].sort(),
  );
  const blockedSettings = await client.callTool({
    name: "read_lunamhub_api",
    arguments: { path: "/settings" },
  });
  assert.equal(blockedSettings.isError, true);
  assert.match(
    blockedSettings.content[0]?.type === "text"
      ? blockedSettings.content[0].text
      : "",
    /not available/,
  );
  const blockedPin = await client.callTool({
    name: "write_lunamhub_api",
    arguments: { method: "PATCH", path: "/family/1", body: { pin: "1234" } },
  });
  assert.equal(blockedPin.isError, true);
  assert.match(
    blockedPin.content[0]?.type === "text" ? blockedPin.content[0].text : "",
    /PINs, passwords, tokens, and secrets/,
  );
  await client.close();
  await server.close();
});
