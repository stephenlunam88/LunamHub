import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Opt in with an isolated PostgreSQL database. Each run uses its own schema.
test("list operations through MCP and the HTTP API", {
  skip: !process.env.LISTS_TEST_DATABASE_URL,
}, async (t) => {
  const schema = `lists_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.LISTS_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.APP_PASSWORD = "local-lists-test";
  const { pool } = await import("@workspace/db");
  await pool.query(`CREATE SCHEMA ${schema}`);
  t.after(async () => {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  });
  await pool.query(`
    CREATE TYPE list_category AS ENUM ('grocery', 'packing', 'school', 'reminders', 'other');
    CREATE TABLE lists (
      id serial PRIMARY KEY, name text NOT NULL,
      category list_category NOT NULL DEFAULT 'other',
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE list_items (
      id serial PRIMARY KEY, list_id integer NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      text text NOT NULL, completed boolean NOT NULL DEFAULT false,
      assigned_to integer, category text, created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  const { listsRouter } = await import("../src/routes/lists.js");
  const app = express();
  app.use(express.json());
  app.post("/api/auth/login", (req, res) => {
    assert.equal(req.body.password, "local-lists-test");
    res.setHeader("Set-Cookie", "lunam.sid=test-session; Path=/; HttpOnly");
    res.json({ ok: true });
  });
  app.use("/api/lists", (req, res, next) => {
    if (req.headers.cookie !== "lunam.sid=test-session") {
      res.sendStatus(401);
      return;
    }
    next();
  }, listsRouter);
  const http = app.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(() => new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())));
  const address = http.address();
  assert.ok(address && typeof address === "object");
  process.env.PORT = String(address.port);

  const { createLunamMcpServer } = await import("../src/lib/mcpOAuth.js");
  const server = createLunamMcpServer({
    token: "test-token", clientId: "test-client",
    scopes: ["api:read", "api:write", "api:delete"],
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "lists-regression", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });

  async function call(name: string, args: Record<string, unknown>, status = 200) {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text?: string }[];
    const text = content.find(part => part.type === "text")?.text ?? "";
    assert.equal(Boolean(result.isError), status >= 400, text);
    assert.ok(text.startsWith(status >= 400 ? `HTTP ${status}` : "Success"), text);
    return text.includes(": ") ? JSON.parse(text.slice(text.indexOf(": ") + 2)) : null;
  }
  const write = (path: string, body: Record<string, unknown>, status = 200, method = "POST") =>
    call("write_lunamhub_api", { method, path, body }, status);
  const read = (path: string, status = 200) => call("read_lunamhub_api", { path }, status);
  const remove = (path: string, status = 204) => call("delete_lunamhub_api", { path }, status);

  let first: { id: number };
  let second: { id: number };
  let item: { id: number };
  await t.test("creates lists with a default category and returns useful validation errors", async () => {
    first = await write("/lists", { name: "  Regression groceries  " }, 201);
    assert.equal((await read(`/lists/${first.id}`)).name, "Regression groceries");
    assert.equal((await read(`/lists/${first.id}`)).category, "other");
    second = await write("/lists", { name: "Packing", category: "packing" }, 201);
    await write("/lists", { name: " " }, 400);
    await write("/lists", { name: "Invalid", category: "not-a-category" }, 400);
    await write("/lists", {}, 400);
    assert.equal((await read("/lists")).length, 2);
  });
  await t.test("reads items through the advertised MCP endpoint", async () => {
    assert.deepEqual(await read(`/lists/${first.id}/items`), []);
    item = await write(`/lists/${first.id}/items`, { text: "Milk" }, 201);
    assert.equal((await read(`/lists/${first.id}/items`))[0].id, item.id);
    assert.equal((await read(`/lists/${first.id}`)).items[0].id, item.id);
  });
  await t.test("wrong-list edits and deletions cannot change another list's item", async () => {
    await write(`/lists/${second.id}/items/${item.id}`, { completed: true }, 404, "PATCH");
    await remove(`/lists/${second.id}/items/${item.id}`, 404);
    assert.equal((await read(`/lists/${first.id}/items`))[0].completed, false);
    await write(`/lists/${first.id}/items/${item.id}`, { completed: true }, 200, "PATCH");
    assert.equal((await read(`/lists/${first.id}/items`))[0].completed, true);
  });
  await t.test("deletes a whole populated list and returns 404 for stale IDs", async () => {
    await remove(`/lists/${first.id}`);
    await read(`/lists/${first.id}`, 404);
    await read(`/lists/${first.id}/items`, 404);
    await remove(`/lists/${first.id}`, 404);
    const remaining = await read("/lists");
    assert.deepEqual(remaining.map((list: { id: number }) => list.id), [second.id]);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM list_items")).rows[0].count, 0);
    const secondItem = await write(`/lists/${second.id}/items`, { text: "Shoes" }, 201);
    await remove(`/lists/${second.id}/items/${secondItem.id}`);
    await remove(`/lists/${second.id}/items/${secondItem.id}`, 404);
    await remove(`/lists/${second.id}`);
    assert.deepEqual(await read("/lists"), []);
  });
});
