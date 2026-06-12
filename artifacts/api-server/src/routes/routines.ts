// Routine routes — mounted at /api/routines
// Daily routines with checklist items and today's completion tracking

import { Router } from "express";
import { db } from "@workspace/db";
import { routinesTable, routineItemsTable, routineCompletionsTable, familyMembersTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import {
  CreateRoutineBody,
  UpdateRoutineBody,
  UpdateRoutineParams,
  DeleteRoutineParams,
  GetRoutineParams,
  CreateRoutineItemBody,
  CreateRoutineItemParams,
  UpdateRoutineItemBody,
  UpdateRoutineItemParams,
  DeleteRoutineItemParams,
  CompleteRoutineItemParams,
  CompleteRoutineItemBody,
} from "@workspace/api-zod";

const router = Router();

async function getMemberById(id: number | null) {
  if (!id) return undefined;
  const [m] = await db.select().from(familyMembersTable).where(eq(familyMembersTable.id, id));
  if (!m) return undefined;
  return { id: m.id, name: m.name, emoji: m.emoji, color: m.color, role: m.role, pointsBalance: m.pointsBalance, createdAt: m.createdAt.toISOString() };
}

function formatRoutine(r: typeof routinesTable.$inferSelect, member?: object) {
  return {
    id: r.id,
    name: r.name,
    assignedTo: r.assignedTo ?? null,
    assignedMember: member,
    timeOfDay: r.timeOfDay,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/routines
router.get("/", async (_req, res) => {
  const routines = await db.select().from(routinesTable).orderBy(routinesTable.createdAt);
  const result = await Promise.all(
    routines.map(async (r) => formatRoutine(r, await getMemberById(r.assignedTo)))
  );
  res.json(result);
});

// POST /api/routines
router.post("/", async (req, res) => {
  const body = CreateRoutineBody.parse(req.body);
  const [routine] = await db.insert(routinesTable).values(body).returning();
  res.status(201).json(formatRoutine(routine, await getMemberById(routine.assignedTo)));
});

// GET /api/routines/:id — with items and today's completions
router.get("/:id", async (req, res) => {
  const { id } = GetRoutineParams.parse({ id: Number(req.params.id) });
  const [routine] = await db.select().from(routinesTable).where(eq(routinesTable.id, id));
  if (!routine) { res.status(404).json({ error: "Not found" }); return; }

  const items = await db.select().from(routineItemsTable).where(eq(routineItemsTable.routineId, id)).orderBy(routineItemsTable.order);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const completions = await db
    .select()
    .from(routineCompletionsTable)
    .where(and(eq(routineCompletionsTable.routineId, id), gte(routineCompletionsTable.completedAt, todayStart)));

  res.json({
    ...formatRoutine(routine, await getMemberById(routine.assignedTo)),
    items: items.map((i) => ({ id: i.id, routineId: i.routineId, text: i.text, order: i.order })),
    completionsToday: completions.map((c) => c.routineItemId),
  });
});

// PATCH /api/routines/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateRoutineParams.parse({ id: Number(req.params.id) });
  const body = UpdateRoutineBody.parse(req.body);
  const [routine] = await db.update(routinesTable).set(body).where(eq(routinesTable.id, id)).returning();
  if (!routine) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatRoutine(routine, await getMemberById(routine.assignedTo)));
});

// DELETE /api/routines/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteRoutineParams.parse({ id: Number(req.params.id) });
  await db.delete(routinesTable).where(eq(routinesTable.id, id));
  res.status(204).send();
});

// POST /api/routines/:id/items
router.post("/:id/items", async (req, res) => {
  const { id } = CreateRoutineItemParams.parse({ id: Number(req.params.id) });
  const body = CreateRoutineItemBody.parse(req.body);
  const [item] = await db.insert(routineItemsTable).values({ ...body, routineId: id }).returning();
  res.status(201).json(item);
});

// PATCH /api/routines/:id/items/:itemId
router.patch("/:id/items/:itemId", async (req, res) => {
  const { id, itemId } = UpdateRoutineItemParams.parse({ id: Number(req.params.id), itemId: Number(req.params.itemId) });
  const body = UpdateRoutineItemBody.parse(req.body);
  const [item] = await db.update(routineItemsTable).set(body).where(eq(routineItemsTable.id, itemId)).returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

// DELETE /api/routines/:id/items/:itemId
router.delete("/:id/items/:itemId", async (req, res) => {
  const { id, itemId } = DeleteRoutineItemParams.parse({ id: Number(req.params.id), itemId: Number(req.params.itemId) });
  await db.delete(routineItemsTable).where(eq(routineItemsTable.id, itemId));
  res.status(204).send();
});

// POST /api/routines/:id/complete — mark a routine item as done today
router.post("/:id/complete", async (req, res) => {
  const { id } = CompleteRoutineItemParams.parse({ id: Number(req.params.id) });
  const body = CompleteRoutineItemBody.parse(req.body);
  const [completion] = await db
    .insert(routineCompletionsTable)
    .values({ routineId: id, routineItemId: body.routineItemId })
    .returning();
  res.json({
    id: completion.id,
    routineId: completion.routineId,
    routineItemId: completion.routineItemId,
    completedAt: completion.completedAt.toISOString(),
  });
});

export { router as routinesRouter };
