// Google Calendar integration — direct OAuth 2.0 via Google REST API
// Replaces @replit/connectors-sdk proxy with native fetch calls.
// The refresh token is stored in the settings table (googleRefreshToken).
// Required env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
// Optional env var:  GOOGLE_OAUTH_REDIRECT_URI (needed for initial OAuth flow only)

import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { logger } from "./logger";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// In-memory access token cache (Google access tokens are valid for ~3600 s)
let _accessToken: string | null = null;
let _tokenExpiresAt = 0;
const TOKEN_BUFFER_MS = 5 * 60_000; // refresh 5 min before expiry

function getOAuthCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function getStoredRefreshToken(): Promise<string | null> {
  try {
    const [row] = await db
      .select({ googleRefreshToken: settingsTable.googleRefreshToken })
      .from(settingsTable)
      .limit(1);
    return row?.googleRefreshToken ?? null;
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (_accessToken && now < _tokenExpiresAt - TOKEN_BUFFER_MS) {
    return _accessToken;
  }
  const creds = getOAuthCredentials();
  if (!creds) return null;
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!res.ok || !data.access_token) {
      logger.warn({ error: data.error }, "gcal: token refresh failed");
      _accessToken = null;
      _tokenExpiresAt = 0;
      return null;
    }
    _accessToken = data.access_token;
    _tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000;
    return _accessToken;
  } catch (err) {
    logger.warn({ err }, "gcal: token refresh error");
    return null;
  }
}

async function directGCal(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${GCAL_BASE}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    return res;
  } catch (err) {
    logger.warn({ err, path }, "gcal: direct API error");
    return null;
  }
}

// Legacy no-op — Replit connector discovery is replaced by direct OAuth redirect.
// Kept so events.ts route signatures don't need to change.
export async function discoverAndStoreConnectionId(): Promise<string | null> {
  return null;
}

// Clear stored OAuth tokens from settings and invalidate the in-memory cache.
export async function clearConnectionId(): Promise<void> {
  try {
    await db
      .insert(settingsTable)
      .values({
        id: 1,
        googleCalendarConnectionId: null,
        googleRefreshToken: null,
      } as typeof settingsTable.$inferInsert)
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: { googleCalendarConnectionId: null, googleRefreshToken: null },
      });
    _accessToken = null;
    _tokenExpiresAt = 0;
  } catch (err) {
    logger.warn({ err }, "gcal: clearConnectionId error");
  }
}

// True if Google OAuth client credentials are configured in environment variables.
// (On NAS: set in .env; on Replit: set as secrets in the workspace.)
export async function checkOAuthAvailable(): Promise<boolean> {
  return getOAuthCredentials() !== null;
}

export async function isGCalConnected(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  const resp = await directGCal("/users/me/calendarList");
  return resp !== null && resp.status >= 200 && resp.status < 300;
}

// Fetch and cache the timezone configured on the user's primary Google Calendar.
let _cachedTz: string | null = null;
let _cachedTzAt = 0;
const TZ_CACHE_MS = 60 * 60_000; // 1 hour

export async function getCalendarTimezone(): Promise<string> {
  const now = Date.now();
  if (_cachedTz && now - _cachedTzAt < TZ_CACHE_MS) return _cachedTz;
  try {
    const resp = await directGCal("/calendars/primary");
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
  const resp = await directGCal(`/calendars/primary/events?${params}`);
  if (!resp || resp.status < 200 || resp.status >= 300) {
    logger.warn({ status: resp?.status }, "gcal: listEvents failed");
    return null;
  }
  const data = (await resp.json()) as { items?: GCalEvent[] };
  return data.items ?? [];
}

// Convert a local date+time to a UTC RFC3339 string (Z suffix).
function localTimeToUTC(dateStr: string, timeStr: string, timezone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
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

// Map LunamHub recurrence strings → Google Calendar RRULE FREQ values
const RECURRENCE_MAP: Record<string, string> = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
};

function buildRRule(recurrence: string | null | undefined, recurrenceEndDate: string | null | undefined): string[] {
  if (!recurrence) return [];
  const freq = RECURRENCE_MAP[recurrence.toUpperCase()];
  if (!freq) return [];
  let rule = `RRULE:FREQ=${freq}`;
  if (recurrenceEndDate) {
    // Google Calendar UNTIL format: YYYYMMDD (no dashes)
    rule += `;UNTIL=${recurrenceEndDate.replace(/-/g, "")}`;
  }
  return [rule];
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
  recurrence?: string | null;
  recurrenceEndDate?: string | null;
}): Promise<string | null> {
  const allDay = event.allDay || !event.startTime;
  const tz = event.timezone || (await getCalendarTimezone());
  const startDt = allDay ? undefined : localTimeToUTC(event.date, event.startTime!, tz);
  const endDt = allDay
    ? undefined
    : localTimeToUTC(event.date, event.endTime ?? event.startTime!, tz);

  logger.info(
    { tz, inputDate: event.date, inputStart: event.startTime, startDt, endDt, recurrence: event.recurrence },
    "gcal: createEvent datetime",
  );

  const rrule = buildRRule(event.recurrence, event.recurrenceEndDate);
  const body: Record<string, unknown> = {
    summary: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    start: allDay ? { date: event.date } : { dateTime: startDt },
    end: allDay ? { date: nextCalendarDay(event.date) } : { dateTime: endDt },
    ...(rrule.length > 0 ? { recurrence: rrule } : {}),
  };
  const resp = await directGCal("/calendars/primary/events", { method: "POST", body });
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
    recurrence?: string | null;
    recurrenceEndDate?: string | null;
  },
): Promise<void> {
  const allDay = event.allDay || !event.startTime;
  const tz = event.timezone || (await getCalendarTimezone());
  const rrule = buildRRule(event.recurrence, event.recurrenceEndDate);

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
    recurrence: rrule,
  };
  const resp = await directGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "PUT", body },
  );
  if (resp && resp.status >= 300) {
    logger.warn({ status: resp.status, googleEventId }, "gcal: updateEvent failed");
  }
}

export async function deleteGCalEvent(googleEventId: string): Promise<void> {
  const resp = await directGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" },
  );
  if (resp && resp.status >= 300 && resp.status !== 404) {
    logger.warn({ status: resp.status, googleEventId }, "gcal: deleteEvent failed");
  }
}
