// Calendar event routes
// Handles creating, reading, updating and deleting events with member assignments

import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, eventMembersTable } from "@workspace/db";
import { eq, gte, lte, inArray } from "drizzle-orm";
import {
  CreateEventBody,
  UpdateEventBody,
  GetEventParams,
  UpdateEventParams,
  DeleteEventParams,
  ListEventsQueryParams,
} from "@workspace/api-zod";

const router = Router();

async function getEventMembers(eventIds: number[]): Promise<Record<number, number[]>> {
  if (eventIds.length === 0) return {};
  const rows = await db.select().from(eventMembersTable).where(inArray(eventMembersTable.eventId, eventIds));
  const map: Record<number, number[]> = {};
  for (const r of rows) {
    if (!map[r.eventId]) map[r.eventId] = [];
    map[r.eventId].push(r.memberId);
  }
  return map;
}

function formatEvent(e: typeof eventsTable.$inferSelect, memberIds: number[] = []) {
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? null,
    date: e.date,
    startTime: e.startTime ?? null,
    endTime: e.endTime ?? null,
    allDay: e.allDay,
    category: e.category,
    assignedMembers: memberIds,
    createdAt: e.createdAt.toISOString(),
  };
}

// GET /api/events — list events with optional filters
router.get("/", async (req, res) => {
  const params = ListEventsQueryParams.parse({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    memberId: req.query.memberId ? Number(req.query.memberId) : undefined,
  });

  let query = db.select().from(eventsTable).$dynamic();
  if (params.startDate) query = query.where(gte(eventsTable.date, params.startDate));
  if (params.endDate) query = query.where(lte(eventsTable.date, params.endDate));

  const events = await query.orderBy(eventsTable.date);
  const memberMap = await getEventMembers(events.map((e) => e.id));

  let result = events.map((e) => formatEvent(e, memberMap[e.id] ?? []));
  if (params.memberId) {
    result = result.filter((e) => e.assignedMembers.includes(params.memberId!));
  }
  res.json(result);
});

// POST /api/events
router.post("/", async (req, res) => {
  const body = CreateEventBody.parse(req.body);
  const assignedMembers: number[] = (body as { assignedMembers?: number[] }).assignedMembers ?? [];
  const { assignedMembers: _drop, ...eventData } = body as typeof body & { assignedMembers?: number[] };

  const [event] = await db.insert(eventsTable).values(eventData).returning();
  if (assignedMembers.length > 0) {
    await db.insert(eventMembersTable).values(assignedMembers.map((mid) => ({ eventId: event.id, memberId: mid })));
  }
  const memberMap = await getEventMembers([event.id]);
  res.status(201).json(formatEvent(event, memberMap[event.id] ?? []));
});

// GET /api/events/:id
router.get("/:id", async (req, res) => {
  const { id } = GetEventParams.parse({ id: Number(req.params.id) });
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (!event) { res.status(404).json({ error: "Not found" }); return; }
  const memberMap = await getEventMembers([id]);
  res.json(formatEvent(event, memberMap[id] ?? []));
});

// PATCH /api/events/:id
router.patch("/:id", async (req, res) => {
  const { id } = UpdateEventParams.parse({ id: Number(req.params.id) });
  const body = UpdateEventBody.parse(req.body);
  const assignedMembers: number[] | undefined = (body as { assignedMembers?: number[] }).assignedMembers;
  const { assignedMembers: _drop, ...eventData } = body as typeof body & { assignedMembers?: number[] };

  const [event] = await db.update(eventsTable).set(eventData).where(eq(eventsTable.id, id)).returning();
  if (!event) { res.status(404).json({ error: "Not found" }); return; }

  if (assignedMembers !== undefined) {
    await db.delete(eventMembersTable).where(eq(eventMembersTable.eventId, id));
    if (assignedMembers.length > 0) {
      await db.insert(eventMembersTable).values(assignedMembers.map((mid) => ({ eventId: id, memberId: mid })));
    }
  }

  const memberMap = await getEventMembers([id]);
  res.json(formatEvent(event, memberMap[id] ?? []));
});

// DELETE /api/events/:id
router.delete("/:id", async (req, res) => {
  const { id } = DeleteEventParams.parse({ id: Number(req.params.id) });
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
  res.status(204).send();
});

export { router as eventsRouter };
