// Google Calendar integration — direct OAuth 2.0 via Google REST API
// Replaces @replit/connectors-sdk proxy with native fetch calls.
// The refresh token is stored in the settings table (googleRefreshToken).
// Required env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
// Optional env var:  GOOGLE_OAUTH_REDIRECT_URI (needed for initial OAuth flow only)

import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { logger } from "./logger";
import {
  calendarEndDate,
  calendarLocalTime,
  collectCalendarPages,
  localTimeToUTC,
  nextCalendarDay,
} from "./calendarTime";
import { householdTimeZone } from "./householdDate";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// In-memory access token cache (Google access tokens are valid for ~3600 s)
let _accessToken: string | null = null;
let _tokenExpiresAt = 0;
const TOKEN_BUFFER_MS = 5 * 60_000; // refresh 5 min before expiry

function getOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
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
      signal: AbortSignal.timeout(15_000),
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
      signal: AbortSignal.timeout(15_000),
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

/** Return a fixed, non-sensitive classification of Google's error message. */
function safeGoogleMessageHint(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  const normalized = message.toLowerCase();

  if (/both .*date.*datetime|date.*and.*datetime/.test(normalized)) {
    return "date_datetime_conflict";
  }
  if (
    /start.*end.*(together|both|required)|(?:together|both|required).*start.*end/.test(
      normalized,
    )
  ) {
    return "incomplete_start_end_pair";
  }
  if (
    /(invalid|unsupported|unknown|not valid)/.test(normalized) &&
    /time.?zone/.test(normalized)
  ) {
    return "invalid_time_zone";
  }
  if (
    /(invalid|unsupported|not valid|must|required)/.test(normalized) &&
    /(recurrence|rrule|until|byday)/.test(normalized)
  ) {
    return "invalid_recurrence";
  }

  // Google sometimes names the rejected field only in `error.message`, rather
  // than in `errors[].location`. Emit the field name only when it is allowlisted.
  const safeFields = [
    "start.dateTime",
    "start.timeZone",
    "start.date",
    "end.dateTime",
    "end.timeZone",
    "end.date",
    "start",
    "end",
    "summary",
    "description",
    "location",
    "recurrence",
    "attendees",
    "reminders",
  ];
  for (const field of safeFields) {
    if (
      normalized.includes(field.toLowerCase()) &&
      /(invalid|must|required|cannot|should|not valid|unsupported)/.test(
        normalized,
      )
    ) {
      return `invalid_google_field:${field}`;
    }
  }

  if (/invalid|bad request/.test(normalized)) return "google_invalid_request";
  return undefined;
}

/** Log only structured Google failure codes and fixed hints; never log event bodies or tokens. */
async function googleFailureDetails(response: Response | null) {
  if (!response) return { httpStatus: null, googleStatus: "NO_RESPONSE" };
  const safeFields = new Set([
    "summary",
    "description",
    "location",
    "start",
    "start.date",
    "start.dateTime",
    "start.timeZone",
    "end",
    "end.date",
    "end.dateTime",
    "end.timeZone",
    "recurrence",
    "attendees",
    "reminders",
  ]);
  const payload = (await response
    .clone()
    .json()
    .catch(() => undefined)) as
    | {
        error?: {
          message?: unknown;
          status?: unknown;
          errors?: Array<{ reason?: unknown; location?: unknown }>;
        };
      }
    | undefined;
  const googleStatus = payload?.error?.status;
  const googleReason = payload?.error?.errors?.find(
    (item) => typeof item.reason === "string",
  )?.reason;
  const rawLocation = payload?.error?.errors?.find(
    (item) => typeof item.location === "string",
  )?.location;
  const normalizedLocation =
    typeof rawLocation === "string"
      ? rawLocation.replace(/^(resource|event)\./, "")
      : undefined;
  const googleMessageHint = safeGoogleMessageHint(payload?.error?.message);
  return {
    httpStatus: response.status,
    ...(typeof googleStatus === "string" ? { googleStatus } : {}),
    ...(typeof googleReason === "string" ? { googleReason } : {}),
    ...(googleMessageHint ? { googleMessageHint } : {}),
    ...(normalizedLocation && safeFields.has(normalizedLocation)
      ? { googleField: normalizedLocation }
      : {}),
  };
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
    resetCalendarCaches();
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

export function resetCalendarCaches() {
  _accessToken = null;
  _tokenExpiresAt = 0;
  _cachedTz = null;
  _cachedTzAt = 0;
}

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
        logger.info(
          { timeZone: data.timeZone },
          "gcal: calendar timezone fetched",
        );
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
  recurringEventId?: string;
  status?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  recurrence?: string[];
}

export async function listGCalEvents(
  startDate: string,
  endDate: string,
): Promise<GCalEvent[] | null> {
  const params = new URLSearchParams({
    timeMin: localTimeToUTC(startDate, "00:00", householdTimeZone()),
    timeMax: localTimeToUTC(
      nextCalendarDay(endDate),
      "00:00",
      householdTimeZone(),
    ),
    timeZone: householdTimeZone(),
    singleEvents: "true",
    maxResults: "250",
  });
  return collectCalendarPages<GCalEvent>(async (pageToken) => {
    if (pageToken) params.set("pageToken", pageToken);
    const resp = await directGCal(`/calendars/primary/events?${params}`);
    if (!resp?.ok)
      throw new Error(
        "Google Calendar could not be read. Please retry or reconnect in Admin.",
      );
    return resp.json() as Promise<{
      items?: GCalEvent[];
      nextPageToken?: string;
    }>;
  });
}

// Map LunamHub recurrence strings → Google Calendar RRULE FREQ values
const RECURRENCE_MAP: Record<string, string> = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
};

// Map JS day-of-week numbers (0=Sun..6=Sat) → RRULE BYDAY abbreviations
const DOW_MAP: Record<number, string> = {
  0: "SU",
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
  6: "SA",
};

function buildRRule(
  recurrence: string | null | undefined,
  recurrenceEndDate: string | null | undefined,
  recurrenceDays?: string | null,
  allDay = true,
  timezone = householdTimeZone(),
): string[] {
  if (!recurrence) return [];
  const upperRec = recurrence.toUpperCase();
  let freq: string;
  let interval = "";
  if (upperRec === "FORTNIGHTLY") {
    freq = "WEEKLY";
    interval = ";INTERVAL=2";
  } else {
    freq = RECURRENCE_MAP[upperRec];
    if (!freq) return [];
  }
  let rule = `RRULE:FREQ=${freq}${interval}`;
  if (recurrenceEndDate) {
    const until = allDay
      ? recurrenceEndDate.replace(/-/g, "")
      : localTimeToUTC(recurrenceEndDate, "23:59", timezone)
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z");
    rule += `;UNTIL=${until}`;
  }
  if (recurrenceDays && (upperRec === "WEEKLY" || upperRec === "FORTNIGHTLY")) {
    const byday = recurrenceDays
      .split(",")
      .map((d) => DOW_MAP[parseInt(d)])
      .filter(Boolean)
      .join(",");
    if (byday) rule += `;BYDAY=${byday}`;
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
  recurrenceDays?: string | null;
}): Promise<string | null> {
  if (!(await getStoredRefreshToken())) return null;
  const allDay = event.allDay || !event.startTime;
  const tz = householdTimeZone();
  const startDt = allDay
    ? undefined
    : localTimeToUTC(event.date, event.startTime!, tz);
  // When no end time is set, default to start + 1 hour (Google rejects zero-duration timed events)
  const endDt = allDay
    ? undefined
    : event.endTime
      ? localTimeToUTC(
          calendarEndDate(event.date, event.startTime!, event.endTime),
          event.endTime,
          tz,
        )
      : new Date(new Date(startDt!).getTime() + 60 * 60_000)
          .toISOString()
          .replace(/\.\d{3}Z$/, "Z");

  logger.info(
    {
      tz,
      inputDate: event.date,
      inputStart: event.startTime,
      startDt,
      endDt,
      recurrence: event.recurrence,
    },
    "gcal: createEvent datetime",
  );

  const rrule = buildRRule(
    event.recurrence,
    event.recurrenceEndDate,
    event.recurrenceDays,
    allDay,
    tz,
  );
  const body: Record<string, unknown> = {
    summary: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
    // timeZone is required by Google for recurring timed events and harmless for single events
    start: allDay ? { date: event.date } : { dateTime: startDt, timeZone: tz },
    end: allDay
      ? { date: nextCalendarDay(event.date) }
      : { dateTime: endDt, timeZone: tz },
    ...(rrule.length > 0 ? { recurrence: rrule } : {}),
  };
  const resp = await directGCal("/calendars/primary/events", {
    method: "POST",
    body,
  });
  if (!resp || resp.status < 200 || resp.status >= 300) {
    logger.warn(await googleFailureDetails(resp), "gcal: createEvent failed");
    throw new Error(
      "Google Calendar could not save this event. Please retry or reconnect in Admin.",
    );
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
    recurrenceDays?: string | null;
  },
  includeRecurrence = true,
): Promise<void> {
  const allDay = event.allDay || !event.startTime;
  const tz = householdTimeZone();
  const rrule = buildRRule(
    event.recurrence,
    event.recurrenceEndDate,
    event.recurrenceDays,
    allDay,
    tz,
  );
  const startDt = allDay
    ? undefined
    : localTimeToUTC(event.date, event.startTime!, tz);
  const endDt = allDay
    ? undefined
    : event.endTime
      ? localTimeToUTC(
          calendarEndDate(event.date, event.startTime!, event.endTime),
          event.endTime,
          tz,
        )
      : new Date(new Date(startDt!).getTime() + 60 * 60_000)
          .toISOString()
          .replace(/\.\d{3}Z$/, "Z");

  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    // timeZone is required by Google for recurring timed events and harmless for single events
    start: allDay ? { date: event.date } : { dateTime: startDt, timeZone: tz },
    end: allDay
      ? { date: nextCalendarDay(event.date) }
      : { dateTime: endDt, timeZone: tz },
    ...(includeRecurrence ? { recurrence: rrule } : {}),
  };
  const resp = await directGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "PATCH", body },
  );
  if (!resp?.ok) {
    logger.warn(await googleFailureDetails(resp), "gcal: updateEvent failed");
    throw new Error(
      "Google Calendar could not update this event. Your changes have not been saved.",
    );
  }
}

/**
 * Cancel a single instance of a recurring GCal series on a specific date.
 * Works reliably for all-day events (instance ID = baseId_YYYYMMDD).
 * For timed events the instance ID format is more complex; we skip silently.
 */
export async function deleteGCalEventInstance(
  googleSeriesId: string,
  date: string,
  allDay: boolean,
): Promise<void> {
  const params = new URLSearchParams({
    timeMin: localTimeToUTC(date, "00:00", householdTimeZone()),
    timeMax: localTimeToUTC(
      nextCalendarDay(date),
      "00:00",
      householdTimeZone(),
    ),
    timeZone: householdTimeZone(),
  });
  const instances = await collectCalendarPages<GCalEvent>(async (token) => {
    if (token) params.set("pageToken", token);
    const response = await directGCal(
      `/calendars/primary/events/${encodeURIComponent(googleSeriesId)}/instances?${params}`,
    );
    if (!response?.ok)
      throw new Error(
        "Unable to find this recurring occurrence in Google Calendar.",
      );
    return response.json() as Promise<{
      items?: GCalEvent[];
      nextPageToken?: string;
    }>;
  });
  const occurrence = instances.find((instance) => {
    const start = instance.originalStartTime ?? instance.start;
    return (
      (start.date ??
        (start.dateTime
          ? calendarLocalTime(start.dateTime, householdTimeZone()).date
          : "")) === date
    );
  });
  if (!occurrence)
    throw new Error(
      "This occurrence has moved or changed in Google Calendar. Sync and try again.",
    );
  await deleteGCalEvent(occurrence.id);
}

/** Returns true if the event/series still exists in GCal, false if 404/410 (deleted). */
export async function gcalEventExists(googleEventId: string): Promise<boolean> {
  const resp = await directGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "GET" },
  );
  if (!resp) return true; // no connection → assume exists, don't delete locally
  return resp.status !== 404 && resp.status !== 410;
}

/** Absence from a date window may mean a move, not deletion. Confirm by ID. */
export async function getGCalEvent(
  googleEventId: string,
): Promise<GCalEvent | null> {
  const response = await directGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
  );
  if (response?.status === 404 || response?.status === 410) return null;
  if (!response?.ok)
    throw new Error(
      "Google Calendar lookup failed. Existing events have been preserved.",
    );
  const event = (await response.json()) as GCalEvent;
  return event.status === "cancelled" ? null : event;
}

export async function deleteGCalEvent(googleEventId: string): Promise<void> {
  const resp = await directGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" },
  );
  if (!resp || (!resp.ok && resp.status !== 404 && resp.status !== 410)) {
    logger.warn(await googleFailureDetails(resp), "gcal: deleteEvent failed");
    throw new Error(
      "Google Calendar could not delete this event. Please retry; it has been kept locally.",
    );
  }
}
