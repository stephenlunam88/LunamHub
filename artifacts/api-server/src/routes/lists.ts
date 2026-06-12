// Shared lists routes — mounted at /api/lists
// Handles list CRUD and list item CRUD including assignment and completion

import { Router } from "express";
import { db } from "@workspace/db";
import { listsTable, listItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateListBody,
  UpdateListBody,
  UpdateListParams,
  DeleteListParams,
  GetListParams,
  CreateListItemBody,
  CreateListItemParams,
  UpdateListItemBody,
  UpdateListItemParams,
  DeleteListItemParams,
} from "@workspace/api-zod";

const router = Router();

function formatList(l: typeof listsTable.$inferSelect) {
  return {
    id: l.id,
    name: l.name,
    category: l.category,
    createdAt: l.createdAt.toISOString(),
  };
}

function formatItem(i: typeof listItemsTable.$inferSelect) {
  return {
    id: i.id,
    listId: i.listId,
    text: i.text,
    completed: i.completed,
    assignedTo: i.assignedTo ?? null,
    category: i.category ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

// GET /api/lists
router.get("/", async (_req, res) => {
  const lists = await db.select().from(listsTable).orderBy(listsTable.createdAt);
  res.json(lists.map(formatList));
});

// POST /api/lists
router.post("/", async (req, res) => {
  const body = CreateListBody.parse(req.body);
  const [list] = await db.insert(listsTable).values(body).returning();
  res.status(201).json(formatList(list));
});

// GET /api/lists/:id — get list with its items
router.get("/:id", async (req, res) => {
  const { id } = GetListParams.parse({ id: Number(req.params.id) });
  const [list] = await db.select().from(listsTable).where(eq(listsTable.id, id));
  if (!list) { res.status(404).json({ error: "Not found" }); return; }
  const items = await db.select().from(listItemsTable).where(eq(listItemsTable.listId, id)).orderBy(listItemsTable.createdAt);
  res.json({ ...formatList(list), items: items.map(formatItem) });
});

// PATCH /api/lists/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateListParams.parse({ id: Number(req.params.id) });
  const body = UpdateListBody.parse(req.body);
  const [list] = await db.update(listsTable).set(body).where(eq(listsTable.id, id)).returning();
  if (!list) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatList(list));
});

// DELETE /api/lists/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteListParams.parse({ id: Number(req.params.id) });
  await db.delete(listsTable).where(eq(listsTable.id, id));
  res.status(204).send();
});

// POST /api/lists/:listId/items
router.post("/:listId/items", async (req, res) => {
  const { listId } = CreateListItemParams.parse({ listId: Number(req.params.listId) });
  const body = CreateListItemBody.parse(req.body);
  const [item] = await db.insert(listItemsTable).values({ ...body, listId }).returning();
  res.status(201).json(formatItem(item));
});

// PATCH /api/lists/:listId/items/:itemId
router.patch("/:listId/items/:itemId", async (req, res) => {
  const { listId, itemId } = UpdateListItemParams.parse({
    listId: Number(req.params.listId),
    itemId: Number(req.params.itemId),
  });
  const body = UpdateListItemBody.parse(req.body);
  const [item] = await db.update(listItemsTable).set(body).where(eq(listItemsTable.id, itemId)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatItem(item));
});

// DELETE /api/lists/:listId/items/:itemId
router.delete("/:listId/items/:itemId", async (req, res) => {
  const { listId, itemId } = DeleteListItemParams.parse({
    listId: Number(req.params.listId),
    itemId: Number(req.params.itemId),
  });
  await db.delete(listItemsTable).where(eq(listItemsTable.id, itemId));
  res.status(204).send();
});

export { router as listsRouter };
