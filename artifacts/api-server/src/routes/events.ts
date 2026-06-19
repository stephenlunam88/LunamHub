// Calendar event routes
// Handles creating, reading, updating and deleting events with member assignments.
// Events created/deleted via this API are also synced to Google Calendar when connected.

import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, eventMembersTable } from "@workspace/db";
import { eq, gte, lte, inArray, or, and, isNull, isNotNull, asc, sql } from "drizzle-orm";
import {
  CreateEventBody,
  UpdateEventBody,
  GetEventParams,
  UpdateEventParams,
  DeleteEventParams,
  ListEventsQueryParams,
  SyncGoogleCalendarBody,
} from "@workspace/api-zod";
import {
  isGCalConnected,
  checkOAuthAvailable,
  listGCalEvents,
  createGCalEvent,
  updateGCalEvent,
  deleteGCalEvent,
  gcalEventExists,
  discoverAndStoreConnectionId,
  clearConnectionId,
  type GCalEvent,
} from "../lib/google-calendar";

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
    location: e.location ?? null,
    date: e.date,
    startTime: e.startTime ?? null,
    endTime: e.endTime ?? null,
    allDay: e.allDay,
    category: e.category,
    recurrence: e.recurrence ?? null,
    recurrenceEndDate: e.recurrenceEndDate ?? null,
    recurrenceDays: e.recurrenceDays ?? null,
    googleEventId: e.googleEventId ?? null,
    assignedMembers: memberIds,
    createdAt: e.createdAt.toISOString(),
  };
}

// Strip any UTC/offset suffix from an RFC3339 dateTime string, leaving the local portion.
// e.g. "2026-06-16T17:45:00+10:00" → "2026-06-16T17:45:00"
//      "2026-06-17T03:45:00Z"       → "2026-06-17T03:45:00"  (best-effort for UTC events)
//      "2026-06-16T17:45:00"        → "2026-06-16T17:45:00"  (floating, unchanged)
function stripTzSuffix(dt: string): string {
  return dt.replace(/Z$|[+-]\d{2}:\d{2}$/, "");
}

// Map a Google Calendar event to our local schema for upsert
function gcalToLocal(ge: GCalEvent): {
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  category: "other";
  googleEventId: string;
} {
  const isAllDay = !!ge.start.date;
  const localStart = ge.start.dateTime ? stripTzSuffix(ge.start.dateTime) : null;
  const localEnd = ge.end.dateTime ? stripTzSuffix(ge.end.dateTime) : null;
  const date = ge.start.date ?? localStart?.slice(0, 10) ?? "";
  const startTime = localStart ? localStart.slice(11, 16) : null;
  const endTime = localEnd ? localEnd.slice(11, 16) : null;
  return {
    title: ge.summary ?? "(No title)",
    description: ge.description ?? null,
    location: ge.location ?? null,
    date,
    startTime,
    endTime,
    allDay: isAllDay,
    category: "other",
    googleEventId: ge.id,
  };
}

// ── Google Calendar status (before /:id to avoid route conflict) ──────────────
router.get("/google-calendar-status", async (req, res): Promise<void> => {
  const connected = await isGCalConnected();
  // oauthAvailable: true means Replit has an OAuth connection even if not activated
  const oauthAvailable = connected ? true : await checkOAuthAvailable();
  res.json({ connected, oauthAvailable });
});

// ── Google Calendar connect (discover + store connection ID) ──────────────────
// This endpoint is called after the user has authorized Google Calendar via the
// Replit integrations panel. It discovers the active connection and stores its ID
// in settings so the app can use it for all subsequent Google Calendar calls.
router.post("/google-calendar-connect", async (req, res): Promise<void> => {
  const connId = await discoverAndStoreConnectionId();
  req.log.info({ connId: connId ? "found" : "none" }, "gcal: connect");
  const connected = connId !== null;
  res.json({ connected });
});

// ── Google Calendar disconnect (clear stored connection ID) ───────────────────
router.post("/google-calendar-disconnect", async (req, res): Promise<void> => {
  await clearConnectionId();
  req.log.info("gcal: disconnect");
  res.json({ connected: false });
});

// ── Google Calendar sync ──────────────────────────────────────────────────────
router.post("/sync-google", async (req, res): Promise<void> => {
  const body = SyncGoogleCalendarBody.parse(req.body);
  const connected = await isGCalConnected();
  if (!connected) {
    res.json({ connected: false, synced: 0 });
    return;
  }

  const gcalEvents = await listGCalEvents(body.startDate, body.endDate);
  if (!gcalEvents) {
    res.json({ connected: true, synced: 0 });
    return;
  }

  let synced = 0;
  for (const ge of gcalEvents) {
    // If this is an expanded instance of a recurring series, skip it when we
    // already manage that series locally (created in LunamHub and pushed to GCal).
    // With singleEvents:true, Google expands each recurrence into an instance with a
    // unique id like "baseId_date" and a recurringEventId pointing to the base series.
    if (ge.recurringEventId) {
      const [parentLocal] = await db
        .select({ id: eventsTable.id })
        .from(eventsTable)
        .where(eq(eventsTable.googleEventId, ge.recurringEventId));
      if (parentLocal) continue;
    }

    // Log raw GCal datetimes so we can verify timezone parsing
    req.log.info(
      { gcalId: ge.id, startDt: ge.start.dateTime, endDt: ge.end.dateTime, startDate: ge.start.date },
      "gcal: raw event datetime",
    );

    const local = gcalToLocal(ge);
    // Find existing local row with this googleEventId
    const [existing] = await db
      .select({ id: eventsTable.id, date: eventsTable.date, startTime: eventsTable.startTime })
      .from(eventsTable)
      .where(eq(eventsTable.googleEventId, ge.id));

    if (existing) {
      // Only overwrite title/description/location from GCal — never overwrite date/time for events
      // that already exist locally. Dates stored in LunamHub are timezone-naive (user's local time)
      // while GCal returns timezone-aware datetimes that can be misinterpreted server-side.
      await db
        .update(eventsTable)
        .set({ title: local.title, description: local.description, location: local.location })
        .where(eq(eventsTable.id, existing.id));
    } else {
      await db.insert(eventsTable).values(local);
    }
    synced++;
  }

  // ── Cleanup: remove local non-recurring GCal-linked events that no longer exist in GCal ──
  // This handles events deleted directly in Google Calendar (not via LunamHub).
  // We only clean up rows with recurrence=NULL so we never touch locally-managed
  // recurring series (e.g. Squads Juniors weekly) even if they also have a googleEventId.
  const allReturnedGcalIds = new Set(gcalEvents.map((ge) => ge.id));
  const localGcalRows = await db
    .select({ id: eventsTable.id, googleEventId: eventsTable.googleEventId })
    .from(eventsTable)
    .where(
      and(
        isNotNull(eventsTable.googleEventId),
        isNull(eventsTable.recurrence),
        gte(eventsTable.date, body.startDate),
        lte(eventsTable.date, body.endDate)
      )
    );
  const staleIds = localGcalRows
    .filter((r) => !allReturnedGcalIds.has(r.googleEventId!))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await db.delete(eventMembersTable).where(inArray(eventMembersTable.eventId, staleIds));
    await db.delete(eventsTable).where(inArray(eventsTable.id, staleIds));
    req.log.info({ deleted: staleIds.length }, "gcal sync: removed stale local events");
  }

  // ── Cleanup: locally-managed recurring series deleted directly from GCal ──────
  // These have recurrence != NULL so they were excluded above. Verify each one
  // still exists via a GCal GET; delete locally if GCal returns 404/410.
  const localRecurringSeries = await db
    .select({ id: eventsTable.id, googleEventId: eventsTable.googleEventId })
    .from(eventsTable)
    .where(and(isNotNull(eventsTable.googleEventId), isNotNull(eventsTable.recurrence)));
  const deletedSeriesIds: number[] = [];
  for (const series of localRecurringSeries) {
    const exists = await gcalEventExists(series.googleEventId!);
    if (!exists) deletedSeriesIds.push(series.id);
  }
  if (deletedSeriesIds.length > 0) {
    await db.delete(eventMembersTable).where(inArray(eventMembersTable.eventId, deletedSeriesIds));
    await db.delete(eventsTable).where(inArray(eventsTable.id, deletedSeriesIds));
    req.log.info({ deleted: deletedSeriesIds.length }, "gcal sync: removed locally-managed recurring series deleted from GCal");
  }

  req.log.info({ synced, deleted: staleIds.length + deletedSeriesIds.length, range: `${body.startDate}..${body.endDate}` }, "gcal sync complete");
  res.json({ connected: true, synced });
});

// ── List events ───────────────────────────────────────────────────────────────
router.get("/", async (req, res): Promise<void> => {
  const params = ListEventsQueryParams.parse({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    memberId: req.query.memberId ? Number(req.query.memberId) : undefined,
  });

  let query = db.select().from(eventsTable).$dynamic();
  if (params.startDate && params.endDate) {
    // Include non-recurring events within the window AND recurring events
    // that started before the window end and whose series overlaps the window.
    query = query.where(
      or(
        // Non-recurring: date must fall within the requested window
        and(
          isNull(eventsTable.recurrence),
          gte(eventsTable.date, params.startDate),
          lte(eventsTable.date, params.endDate)
        ),
        // Recurring: event starts on or before the window end, and the series
        // hasn't ended before the window start (or has no end date)
        and(
          isNotNull(eventsTable.recurrence),
          lte(eventsTable.date, params.endDate),
          or(
            isNull(eventsTable.recurrenceEndDate),
            gte(eventsTable.recurrenceEndDate, params.startDate)
          )
        )
      )
    );
  } else {
    if (params.startDate) query = query.where(gte(eventsTable.date, params.startDate));
    if (params.endDate) query = query.where(lte(eventsTable.date, params.endDate));
  }

  const events = await query.orderBy(
    asc(eventsTable.date),
    sql`${eventsTable.startTime} ASC NULLS LAST`,
    asc(eventsTable.id)
  );
  const memberMap = await getEventMembers(events.map((e) => e.id));

  let result = events.map((e) => formatEvent(e, memberMap[e.id] ?? []));
  if (params.memberId) {
    result = result.filter((e) => e.assignedMembers.includes(params.memberId!));
  }
  res.json(result);
});

// ── Create event (also pushes to Google Calendar) ────────────────────────────
router.post("/", async (req, res): Promise<void> => {
  req.log.info({ rawTimezone: (req.body as Record<string, unknown>).timezone }, "create event: raw timezone from req.body");
  const body = CreateEventBody.parse(req.body);
  const assignedMembers: number[] = (body as { assignedMembers?: number[] }).assignedMembers ?? [];
  const timezone: string | undefined = (body as { timezone?: string }).timezone;
  const { assignedMembers: _drop, timezone: _tz, ...eventData } = body as typeof body & { assignedMembers?: number[]; timezone?: string };

  const [event] = await db.insert(eventsTable).values(eventData).returning();

  // Best-effort push to Google Calendar; store returned googleEventId
  const gcalId = await createGCalEvent({
    title: event.title,
    description: event.description,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
    timezone,
    recurrence: event.recurrence,
    recurrenceEndDate: event.recurrenceEndDate,
    recurrenceDays: event.recurrenceDays,
  });
  if (gcalId) {
    await db.update(eventsTable).set({ googleEventId: gcalId }).where(eq(eventsTable.id, event.id));
    event.googleEventId = gcalId;
  }

  if (assignedMembers.length > 0) {
    await db.insert(eventMembersTable).values(assignedMembers.map((mid) => ({ eventId: event.id, memberId: mid })));
  }
  const memberMap = await getEventMembers([event.id]);
  res.status(201).json(formatEvent(event, memberMap[event.id] ?? []));
});

// ── Get event ─────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res): Promise<void> => {
  const { id } = GetEventParams.parse({ id: Number(req.params.id) });
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (!event) { res.status(404).json({ error: "Not found" }); return; }
  const memberMap = await getEventMembers([id]);
  res.json(formatEvent(event, memberMap[id] ?? []));
});

// ── Update event (also updates Google Calendar if synced) ─────────────────────
router.patch("/:id", async (req, res): Promise<void> => {
  const { id } = UpdateEventParams.parse({ id: Number(req.params.id) });
  const body = UpdateEventBody.parse(req.body);
  const assignedMembers: number[] | undefined = (body as { assignedMembers?: number[] }).assignedMembers;
  const timezone: string | undefined = (body as { timezone?: string }).timezone;
  const { assignedMembers: _drop, timezone: _tz, ...eventData } = body as typeof body & { assignedMembers?: number[]; timezone?: string };

  const [event] = await db.update(eventsTable).set(eventData).where(eq(eventsTable.id, id)).returning();
  if (!event) { res.status(404).json({ error: "Not found" }); return; }

  // Best-effort update on Google Calendar if this event was synced
  if (event.googleEventId) {
    updateGCalEvent(event.googleEventId, {
      title: event.title,
      description: event.description,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      allDay: event.allDay,
      timezone,
      recurrence: event.recurrence,
      recurrenceEndDate: event.recurrenceEndDate,
      recurrenceDays: event.recurrenceDays,
    }).catch(() => {});
  }

  if (assignedMembers !== undefined) {
    await db.delete(eventMembersTable).where(eq(eventMembersTable.eventId, id));
    if (assignedMembers.length > 0) {
      await db.insert(eventMembersTable).values(assignedMembers.map((mid) => ({ eventId: id, memberId: mid })));
    }
  }

  const memberMap = await getEventMembers([id]);
  res.json(formatEvent(event, memberMap[id] ?? []));
});

// ── Delete event (also deletes from Google Calendar) ─────────────────────────
router.delete("/:id", async (req, res): Promise<void> => {
  const { id } = DeleteEventParams.parse({ id: Number(req.params.id) });
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
  if (event?.googleEventId) {
    // Await the GCal delete before responding — the client immediately re-syncs on
    // success, and a fire-and-forget here causes a race where the sync re-imports
    // the event before GCal has processed the delete.
    await deleteGCalEvent(event.googleEventId).catch(() => {});
  }
  await db.delete(eventsTable).where(eq(eventsTable.id, id));
  res.status(204).send();
});

export { router as eventsRouter };
