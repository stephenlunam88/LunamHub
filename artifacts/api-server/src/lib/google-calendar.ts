// Google Calendar integration — uses @replit/connectors-sdk
// Proxy path format: /calendar/v3/{path} with Connection-Id header
// Connection ID is stored in the settings table (googleCalendarConnectionId)
// and resolved dynamically at runtime via discoverConnectionId().

import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { logger } from "./logger";

const GCAL_PATH_BASE = "/calendar/v3";

function getConnectors(): ReplitConnectors | null {
  try {
    return new ReplitConnectors();
  } catch {
    return null;
  }
}

// Discover the active google-calendar connection ID via the SDK and store it in settings
export async function discoverAndStoreConnectionId(): Promise<string | null> {
  const connectors = getConnectors();
  if (!connectors) return null;
  try {
    const conns = await connectors.listConnections({ connector_names: "google-calendar" });
    const conn = conns.find((c) => c.status === "healthy" || !c.status) ?? conns[0];
    if (!conn) return null;
    const connId = conn.id as string;
    // Upsert into settings row 1
    await db
      .insert(settingsTable)
      .values({ id: 1, googleCalendarConnectionId: connId } as typeof settingsTable.$inferInsert)
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: { googleCalendarConnectionId: connId },
      });
    return connId;
  } catch (err) {
    logger.warn({ err }, "gcal: discoverConnectionId error");
    return null;
  }
}

// Clear the stored connection ID from settings
export async function clearConnectionId(): Promise<void> {
  try {
    await db
      .insert(settingsTable)
      .values({ id: 1, googleCalendarConnectionId: null } as typeof settingsTable.$inferInsert)
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: { googleCalendarConnectionId: null },
      });
  } catch (err) {
    logger.warn({ err }, "gcal: clearConnectionId error");
  }
}

// Read the stored connection ID from settings
async function getStoredConnectionId(): Promise<string | null> {
  try {
    const [row] = await db.select({ googleCalendarConnectionId: settingsTable.googleCalendarConnectionId }).from(settingsTable).limit(1);
    return row?.googleCalendarConnectionId ?? null;
  } catch {
    return null;
  }
}

async function proxyGCal(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<Response | null> {
  const connectors = getConnectors();
  if (!connectors) return null;
  const connId = await getStoredConnectionId();
  if (!connId) return null;
  try {
    return await connectors.proxy("google-calendar", `${GCAL_PATH_BASE}${path}`, {
      method: options?.method ?? "GET",
      body: options?.body,
      headers: { "Connection-Id": connId },
    });
  } catch (err) {
    logger.warn({ err, path }, "gcal: proxy error");
    return null;
  }
}

// Check whether a Google Calendar OAuth connection exists in Replit (without storing)
export async function checkOAuthAvailable(): Promise<boolean> {
  const connectors = getConnectors();
  if (!connectors) return false;
  try {
    const conns = await connectors.listConnections({ connector_names: "google-calendar" });
    return conns.length > 0;
  } catch {
    return false;
  }
}

export async function isGCalConnected(): Promise<boolean> {
  const connId = await getStoredConnectionId();
  if (!connId) return false;
  const resp = await proxyGCal("/users/me/calendarList");
  return resp !== null && resp.status >= 200 && resp.status < 300;
}

// Fetch and cache the timezone configured on the user's primary Google Calendar.
// This is the authoritative source — do not rely on the browser sending a timezone header.
let _cachedTz: string | null = null;
let _cachedTzAt = 0;
const TZ_CACHE_MS = 60 * 60_000; // 1 hour

export async function getCalendarTimezone(): Promise<string> {
  const now = Date.now();
  if (_cachedTz && now - _cachedTzAt < TZ_CACHE_MS) return _cachedTz;
  try {
    const resp = await proxyGCal("/calendars/primary");
    if (resp && resp.status === 200) {
      const data = (await resp.json()) as { timeZone?: string };
      if (data.timeZone) {
        _cachedTz = data.timeZone;
        _cachedTzAt = now;
        logger.info({ timeZone: data.timeZone }, "gcal: calendar timezone fetched");
        return _cachedTz;
      }
    }
  } catch (err) {
    logger.warn({ err }, "gcal: failed to fetch calendar timezone");
  }
  return "UTC";
}

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

export async function listGCalEvents(
  startDate: string,
  endDate: string,
): Promise<GCalEvent[] | null> {
  const params = new URLSearchParams({
    timeMin: `${startDate}T00:00:00Z`,
    timeMax: `${endDate}T23:59:59Z`,
    singleEvents: "true",
    maxResults: "250",
  });
  const resp = await proxyGCal(`/calendars/primary/events?${params}`);
  if (!resp || resp.status < 200 || resp.status >= 300) {
    logger.warn({ status: resp?.status }, "gcal: listEvents failed");
    return null;
  }
  const data = (await resp.json()) as { items?: GCalEvent[] };
  return data.items ?? [];
}

// Convert a local date+time to a UTC RFC3339 string (Z suffix).
// The Replit connectors-sdk proxy strips timezone offsets from dateTime strings before
// forwarding to Google Calendar, so any offset/timezone info embedded in the string is
// silently discarded. Sending a true UTC time avoids this: even if the proxy strips the Z,
// GCal receives the correct floating UTC time and stores it correctly.
//
// Example: localTimeToUTC("2026-06-16", "17:45", "Australia/Sydney") → "2026-06-16T07:45:00Z"
//   Probe offset at noon UTC on date → "GMT+10:00" → offsetMinutes = +600
//   UTC = 17:45 local − 10:00 = 07:45 UTC
function localTimeToUTC(dateStr: string, timeStr: string, timezone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  // Probe the timezone offset at noon UTC on the event date (avoids DST ambiguity at midnight).
  const probeDate = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(probeDate);
  const offsetStr = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offsetStr.match(/GMT([+-])(\d{2}):(\d{2})/);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    offsetMinutes = sign * (parseInt(match[2]) * 60 + parseInt(match[3]));
  }
  // UTC = local − offset
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0) - offsetMinutes * 60_000;
  const u = new Date(utcMs);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}T${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}:00Z`;
}

function nextCalendarDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

export async function createGCalEvent(event: {
  title: string;
  description?: string | null;
  location?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay: boolean;
  timezone?: string | null;
}): Promise<string | null> {
  const allDay = event.allDay || !event.startTime;
  const tz = event.timezone || await getCalendarTimezone();
  const startDt = allDay ? undefined : localTimeToUTC(event.date, event.startTime!, tz);
  const endDt = allDay ? undefined : localTimeToUTC(event.date, event.endTime ?? event.startTime!, tz);

  logger.info({ tz, inputDate: event.date, inputStart: event.startTime, startDt, endDt }, "gcal: createEvent datetime");

  const body: Record<string, unknown> = {
    summary: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    start: allDay ? { date: event.date } : { dateTime: startDt },
    end: allDay ? { date: nextCalendarDay(event.date) } : { dateTime: endDt },
  };
  const resp = await proxyGCal("/calendars/primary/events", {
    method: "POST",
    body,
  });
  if (!resp || resp.status < 200 || resp.status >= 300) {
    logger.warn({ status: resp?.status }, "gcal: createEvent failed");
    return null;
  }
  const data = (await resp.json()) as { id?: string };
  return data.id ?? null;
}

export async function updateGCalEvent(
  googleEventId: string,
  event: {
    title: string;
    description?: string | null;
    location?: string | null;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    allDay: boolean;
    timezone?: string | null;
  },
): Promise<void> {
  const allDay = event.allDay || !event.startTime;
  const tz = event.timezone || await getCalendarTimezone();

  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    start: allDay
      ? { date: event.date }
      : { dateTime: localTimeToUTC(event.date, event.startTime!, tz) },
    end: allDay
      ? { date: nextCalendarDay(event.date) }
      : { dateTime: localTimeToUTC(event.date, event.endTime ?? event.startTime!, tz) },
  };
  const resp = await proxyGCal(`/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
    method: "PUT",
    body,
  });
  if (resp && resp.status >= 300) {
    logger.warn({ status: resp.status, googleEventId }, "gcal: updateEvent failed");
  }
}

export async function deleteGCalEvent(googleEventId: string): Promise<void> {
  const resp = await proxyGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" },
  );
  if (resp && resp.status >= 300 && resp.status !== 404) {
    logger.warn({ status: resp.status, googleEventId }, "gcal: deleteEvent failed");
  }
}
