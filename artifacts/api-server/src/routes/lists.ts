// Shared lists routes — mounted at /api/lists
// Handles list CRUD and list item CRUD including assignment and completion

import { Router, type ErrorRequestHandler } from "express";
import { db } from "@workspace/db";
import { listsTable, listItemsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z, ZodError } from "zod";
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
const CreateListRequest = CreateListBody.extend({
  name: z.string().trim().min(1),
  category: CreateListBody.shape.category.default("other"),
});

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
  const body = CreateListRequest.parse(req.body);
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
  const [deleted] = await db.delete(listsTable).where(eq(listsTable.id, id)).returning({ id: listsTable.id });
  if (!deleted) { res.status(404).json({ error: "List not found" }); return; }
  res.status(204).send();
});

// GET /api/lists/:listId/items — also used by the ChatGPT connection
router.get("/:listId/items", async (req, res) => {
  const { id } = GetListParams.parse({ id: Number(req.params.listId) });
  const [list] = await db.select({ id: listsTable.id }).from(listsTable).where(eq(listsTable.id, id));
  if (!list) { res.status(404).json({ error: "List not found" }); return; }
  const items = await db.select().from(listItemsTable).where(eq(listItemsTable.listId, id)).orderBy(listItemsTable.createdAt);
  res.json(items.map(formatItem));
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
  const [item] = await db.update(listItemsTable).set(body).where(and(eq(listItemsTable.id, itemId), eq(listItemsTable.listId, listId))).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatItem(item));
});

// DELETE /api/lists/:listId/items/:itemId
router.delete("/:listId/items/:itemId", async (req, res) => {
  const { listId, itemId } = DeleteListItemParams.parse({
    listId: Number(req.params.listId),
    itemId: Number(req.params.itemId),
  });
  const [deleted] = await db.delete(listItemsTable).where(and(eq(listItemsTable.id, itemId), eq(listItemsTable.listId, listId))).returning({ id: listItemsTable.id });
  if (!deleted) { res.status(404).json({ error: "List item not found" }); return; }
  res.status(204).send();
});

const handleValidationError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid list request", issues: error.issues });
    return;
  }
  next(error);
};
router.use(handleValidationError);

export { router as listsRouter };
