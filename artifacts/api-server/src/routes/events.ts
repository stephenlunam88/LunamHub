// Calendar event routes
// Handles creating, reading, updating and deleting events with member assignments.
// Events created/deleted via this API are also synced to Google Calendar when connected.

import { Router, type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { calendarLocalTime, nextCalendarDay } from "../lib/calendarTime";
import { occursOn, parseGoogleRecurrence } from "../lib/calendarRecurrence";
import { householdTimeZone } from "../lib/householdDate";
import { requireParentVerification } from "../middleware/requireParentVerification";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { eventsTable, eventMembersTable } from "@workspace/db";
import {
  eq,
  gte,
  lte,
  inArray,
  or,
  and,
  isNull,
  isNotNull,
  asc,
  sql,
} from "drizzle-orm";
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
  deleteGCalEventInstance,
  getGCalEvent,
  discoverAndStoreConnectionId,
  clearConnectionId,
  type GCalEvent,
} from "../lib/google-calendar";

const router = Router();

async function getEventMembers(
  eventIds: number[],
): Promise<Record<number, number[]>> {
  if (eventIds.length === 0) return {};
  const rows = await db
    .select()
    .from(eventMembersTable)
    .where(inArray(eventMembersTable.eventId, eventIds));
  const map: Record<number, number[]> = {};
  for (const r of rows) {
    if (!map[r.eventId]) map[r.eventId] = [];
    map[r.eventId].push(r.memberId);
  }
  return map;
}

function formatEvent(
  e: typeof eventsTable.$inferSelect,
  memberIds: number[] = [],
) {
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
    recurrenceExceptions: e.recurrenceExceptions ?? null,
    googleEventId: e.googleEventId ?? null,
    assignedMembers: memberIds,
    createdAt: e.createdAt.toISOString(),
  };
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
  const localStart = ge.start.dateTime
    ? calendarLocalTime(ge.start.dateTime, householdTimeZone())
    : null;
  const localEnd = ge.end.dateTime
    ? calendarLocalTime(ge.end.dateTime, householdTimeZone())
    : null;
  const date = ge.start.date ?? localStart?.date ?? "";
  const startTime = localStart?.time ?? null;
  const endTime = localEnd?.time ?? null;
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
  res.json({ connected, oauthAvailable, timeZone: householdTimeZone() });
});

// ── Google Calendar connect (discover + store connection ID) ──────────────────
// This endpoint is called after the user has authorized Google Calendar via the
// Replit integrations panel. It discovers the active connection and stores its ID
// in settings so the app can use it for all subsequent Google Calendar calls.
router.post(
  "/google-calendar-connect",
  requireParentVerification,
  async (req, res): Promise<void> => {
    const connId = await discoverAndStoreConnectionId();
    req.log.info({ connId: connId ? "found" : "none" }, "gcal: connect");
    const connected = connId !== null;
    res.json({ connected });
  },
);

// ── Google Calendar disconnect (clear stored connection ID) ───────────────────
router.post(
  "/google-calendar-disconnect",
  requireParentVerification,
  async (req, res): Promise<void> => {
    await clearConnectionId();
    req.log.info("gcal: disconnect");
    res.json({ connected: false });
  },
);

// ── Google Calendar sync ──────────────────────────────────────────────────────
export async function syncCalendarRange(body: {
  startDate: string;
  endDate: string;
}) {
  const connected = await isGCalConnected();
  if (!connected) {
    return { connected: false, synced: 0 };
  }

  const outcome = await db.transaction(async (db) => {
    // Serialize imports and edits across tabs/processes without imposing a unique
    // constraint on historical data that may already contain duplicates.
    await db.execute(sql`SELECT pg_advisory_xact_lock(72614391)`);
    const gcalEvents = await listGCalEvents(body.startDate, body.endDate);
    if (!gcalEvents) throw new Error("Google Calendar unavailable");

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
      logger.info(
        {
          gcalId: ge.id,
          startDt: ge.start.dateTime,
          endDt: ge.end.dateTime,
          startDate: ge.start.date,
        },
        "gcal: raw event datetime",
      );

      const local = gcalToLocal(ge);
      // Find existing local row with this googleEventId
      const [existing] = await db
        .select({
          id: eventsTable.id,
          date: eventsTable.date,
          startTime: eventsTable.startTime,
        })
        .from(eventsTable)
        .where(eq(eventsTable.googleEventId, ge.id));

      if (existing) {
        // Google owns synced event content; category and member assignments stay local.
        const { category: _category, ...fields } = local;
        await db
          .update(eventsTable)
          .set(fields)
          .where(eq(eventsTable.id, existing.id));
      } else {
        await db.insert(eventsTable).values(local);
      }
      synced++;
    }

    // Refresh locally-managed series, including Google reschedules and exceptions.
    const localSeries = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          isNotNull(eventsTable.googleEventId),
          isNotNull(eventsTable.recurrence),
        ),
      );
    const deletedSeriesIds: number[] = [];
    for (const series of localSeries) {
      const remote = await getGCalEvent(series.googleEventId!);
      if (!remote) {
        deletedSeriesIds.push(series.id);
        continue;
      }
      const { category: _category, ...content } = gcalToLocal(remote);
      const recurrence = parseGoogleRecurrence(
        remote.recurrence,
        householdTimeZone(),
      );
      const base = {
        ...series,
        ...content,
        ...recurrence,
        recurrenceExceptions: null,
      };
      const exceptions = new Set(
        (series.recurrenceExceptions?.split(",") ?? []).filter(
          (date) => date < body.startDate || date > body.endDate,
        ),
      );
      const instances = gcalEvents.filter(
        (event) => event.recurringEventId === series.googleEventId,
      );
      for (
        let date = body.startDate;
        date <= body.endDate;
        date = nextCalendarDay(date)
      ) {
        if (!occursOn(base, date)) continue;
        const instance = instances.find((event) => {
          const start = event.originalStartTime ?? event.start;
          return (
            (start.date ??
              (start.dateTime
                ? calendarLocalTime(start.dateTime, householdTimeZone()).date
                : "")) === date
          );
        });
        if (!instance) {
          exceptions.add(date);
          continue;
        }
        const local = gcalToLocal(instance);
        const changed =
          local.date !== date ||
          local.startTime !== base.startTime ||
          local.endTime !== base.endTime ||
          local.allDay !== base.allDay ||
          local.title !== base.title ||
          local.description !== base.description ||
          local.location !== base.location;
        if (!changed) {
          // A previous edited occurrence may have been restored to the series.
          await db
            .delete(eventsTable)
            .where(eq(eventsTable.googleEventId, instance.id));
          continue;
        }
        exceptions.add(date);
        const [override] = await db
          .select()
          .from(eventsTable)
          .where(eq(eventsTable.googleEventId, instance.id));
        const { category: _dropCategory, ...overrideContent } = local;
        if (override)
          await db
            .update(eventsTable)
            .set(overrideContent)
            .where(eq(eventsTable.id, override.id));
        else {
          const [created] = await db
            .insert(eventsTable)
            .values({ ...local, category: series.category })
            .returning();
          const members = await db
            .select()
            .from(eventMembersTable)
            .where(eq(eventMembersTable.eventId, series.id));
          if (members.length)
            await db
              .insert(eventMembersTable)
              .values(
              members.map((member) => ({
                eventId: created.id,
                memberId: member.memberId,
              })),
            );
        }
      }
      await db
        .update(eventsTable)
        .set({
          ...content,
          ...recurrence,
          recurrenceExceptions: [...exceptions].sort().join(",") || null,
        })
        .where(eq(eventsTable.id, series.id));
    }
    if (deletedSeriesIds.length)
      await db
        .delete(eventsTable)
        .where(inArray(eventsTable.id, deletedSeriesIds));

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
          lte(eventsTable.date, body.endDate),
        ),
      );
    const staleIds: number[] = [];
    for (const row of localGcalRows.filter(
      (r) => !allReturnedGcalIds.has(r.googleEventId!),
    )) {
      const remote = await getGCalEvent(row.googleEventId!);
      if (!remote) staleIds.push(row.id);
      else {
        const { category: _category, ...fields } = gcalToLocal(remote);
        await db
          .update(eventsTable)
          .set(fields)
          .where(eq(eventsTable.id, row.id));
      }
    }
    if (staleIds.length > 0) {
      await db
        .delete(eventMembersTable)
        .where(inArray(eventMembersTable.eventId, staleIds));
      await db.delete(eventsTable).where(inArray(eventsTable.id, staleIds));
      logger.info(
        { deleted: staleIds.length },
        "gcal sync: removed stale local events",
      );
    }

    // ── Cleanup: locally-managed recurring series deleted directly from GCal ──────
    // These have recurrence != NULL so they were excluded above. Verify each one
    // still exists via a GCal GET; delete locally if GCal returns 404/410.
    logger.info(
      {
        synced,
        deleted: staleIds.length + deletedSeriesIds.length,
        range: `${body.startDate}..${body.endDate}`,
      },
      "gcal sync complete",
    );
    return { connected: true, synced };
  });
  return outcome;
}

router.post("/sync-google", async (req, res): Promise<void> => {
  const body = SyncGoogleCalendarBody.parse(req.body);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ||
    body.startDate > body.endDate ||
    Date.parse(body.endDate) - Date.parse(body.startDate) > 366 * 86400000
  ) {
    res
      .status(400)
      .json({ error: "Choose a valid calendar range of at most one year." });
    return;
  }
  res.json(await syncCalendarRange(body));
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
          lte(eventsTable.date, params.endDate),
        ),
        // Recurring: event starts on or before the window end, and the series
        // hasn't ended before the window start (or has no end date)
        and(
          isNotNull(eventsTable.recurrence),
          lte(eventsTable.date, params.endDate),
          or(
            isNull(eventsTable.recurrenceEndDate),
            gte(eventsTable.recurrenceEndDate, params.startDate),
          ),
        ),
      ),
    );
  } else {
    if (params.startDate)
      query = query.where(gte(eventsTable.date, params.startDate));
    if (params.endDate)
      query = query.where(lte(eventsTable.date, params.endDate));
  }

  const events = await query.orderBy(
    asc(eventsTable.date),
    sql`${eventsTable.startTime} ASC NULLS LAST`,
    asc(eventsTable.id),
  );
  const memberMap = await getEventMembers(events.map((e) => e.id));

  let result = events.map((e) => formatEvent(e, memberMap[e.id] ?? []));
  if (params.memberId) {
    result = result.filter((e) => e.assignedMembers.includes(params.memberId!));
  }
  res.json(result);
});

// ── Create event (also pushes to Google Calendar) ────────────────────────────
export async function createCalendarEvent(
  input: unknown,
): Promise<ReturnType<typeof formatEvent>> {
  const body = CreateEventBody.parse(input);
  const assignedMembers: number[] =
    (body as { assignedMembers?: number[] }).assignedMembers ?? [];
  const timezone: string | undefined = (body as { timezone?: string }).timezone;
  const {
    assignedMembers: _drop,
    timezone: _tz,
    ...eventData
  } = body as typeof body & { assignedMembers?: number[]; timezone?: string };

  const result = await db.transaction(async (db) => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(72614391)`);
    const [event] = await db.insert(eventsTable).values(eventData).returning();

    if (assignedMembers.length > 0) {
      await db
        .insert(eventMembersTable)
        .values(
        [...new Set(assignedMembers)].map((mid) => ({
          eventId: event.id,
          memberId: mid,
        })),
      );
    }

    // Best-effort push to Google Calendar; store returned googleEventId
    const gcalId = await createGCalEvent({
      title: event.title,
      description: event.description,
      location: event.location,
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
      await db
        .update(eventsTable)
        .set({ googleEventId: gcalId })
        .where(eq(eventsTable.id, event.id));
      event.googleEventId = gcalId;
    }

    return formatEvent(event, [...new Set(assignedMembers)]);
  });
  return result;
}

router.post("/", async (req, res): Promise<void> => {
  req.log.info(
    { rawTimezone: (req.body as Record<string, unknown>).timezone },
    "create event: raw timezone from req.body",
  );
  res.status(201).json(await createCalendarEvent(req.body));
});

// ── Get event ─────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res): Promise<void> => {
  const { id } = GetEventParams.parse({ id: Number(req.params.id) });
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, id));
  if (!event) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const memberMap = await getEventMembers([id]);
  res.json(formatEvent(event, memberMap[id] ?? []));
});

// ── Update event (also updates Google Calendar if synced) ─────────────────────
router.patch("/:id", async (req, res): Promise<void> => {
  const { id } = UpdateEventParams.parse({ id: Number(req.params.id) });
  const body = UpdateEventBody.parse(req.body);
  const assignedMembers: number[] | undefined = (
    body as { assignedMembers?: number[] }
  ).assignedMembers;
  const timezone: string | undefined = (body as { timezone?: string }).timezone;
  const {
    assignedMembers: _drop,
    timezone: _tz,
    ...eventData
  } = body as typeof body & { assignedMembers?: number[]; timezone?: string };

  const updated = await db.transaction(async (db) => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(72614391)`);
    const [existing] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, id));
    if (!existing) return null;
    const event = Object.keys(eventData).length
      ? (
          await db
            .update(eventsTable)
            .set(eventData)
            .where(eq(eventsTable.id, id))
            .returning()
        )[0]
      : existing;

    // Best-effort update on Google Calendar if this event was synced
    if (event.googleEventId) {
      // If only recurrenceExceptions changed (single-occurrence delete), cancel just that instance
      const newException = (body as { recurrenceExceptions?: string | null })
        .recurrenceExceptions;
      const isExceptionOnlyUpdate =
        newException !== undefined &&
        Object.keys(eventData).every((k) => k === "recurrenceExceptions");
      if (isExceptionOnlyUpdate && newException) {
        // The last comma-separated date is the newly added exception
        const previous = new Set(
          existing.recurrenceExceptions?.split(",") ?? [],
        );
        for (const addedDate of newException
          .split(",")
          .filter((date) => !previous.has(date))) {
          await deleteGCalEventInstance(
            event.googleEventId,
            addedDate,
            event.allDay,
          );
        }
      } else {
        await updateGCalEvent(
          event.googleEventId,
          {
            title: event.title,
            description: event.description,
            location: event.location,
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            allDay: event.allDay,
            timezone,
            recurrence: event.recurrence,
            recurrenceEndDate: event.recurrenceEndDate,
            recurrenceDays: event.recurrenceDays,
          },
          Boolean(existing.recurrence || event.recurrence),
        );
      }
    }

    if (assignedMembers !== undefined) {
      await db
        .delete(eventMembersTable)
        .where(eq(eventMembersTable.eventId, id));
      if (assignedMembers.length > 0) {
        await db
          .insert(eventMembersTable)
          .values(
            assignedMembers.map((mid) => ({ eventId: id, memberId: mid })),
          );
      }
    }

    return event;
  });
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const memberMap = await getEventMembers([id]);
  res.json(formatEvent(updated, memberMap[id] ?? []));
});

// ── Delete event (also deletes from Google Calendar) ─────────────────────────
router.delete("/:id", async (req, res): Promise<void> => {
  const { id } = DeleteEventParams.parse({ id: Number(req.params.id) });
  await db.transaction(async (db) => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(72614391)`);
    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, id));
    if (event?.googleEventId) {
      // Await the GCal delete before responding — the client immediately re-syncs on
      // success, and a fire-and-forget here causes a race where the sync re-imports
      // the event before GCal has processed the delete.
      await deleteGCalEvent(event.googleEventId);
    }
    await db.delete(eventsTable).where(eq(eventsTable.id, id));
  });
  res.status(204).send();
});

const handleCalendarError: ErrorRequestHandler = (error, req, res, _next) => {
  req.log.error({ err: error }, "Calendar operation failed");
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Please check the event details." });
    return;
  }
  res
    .status(502)
    .json({
    error:
      "Calendar operation failed. Your local events have been preserved. Check the Google connection in Admin and retry.",
    });
};
router.use(handleCalendarError);

export { router as eventsRouter };
