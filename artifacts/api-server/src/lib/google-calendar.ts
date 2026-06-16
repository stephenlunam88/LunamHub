// Google Calendar integration helper
//
// Uses the Replit Google Calendar connector for OAuth token management.
// The connector handles token refresh automatically via its proxy.
//
// Required env vars (set by Replit after the user connects their Google Calendar
// account via the connector — run `addIntegration` after `proposeIntegration`):
//   REPLIT_CONNECTORS_HOSTNAME  — Replit connector proxy hostname
//   REPL_IDENTITY               — Replit identity JWT for proxy auth
//   GOOGLE_CALENDAR_CONNECTION_ID — Connection ID from addIntegration output
//
// Until those vars are present, all functions return null / false gracefully.

import { logger } from "./logger";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

async function getAccessToken(): Promise<string | null> {
  const host = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const identity = process.env["REPL_IDENTITY"];
  const connId = process.env["GOOGLE_CALENDAR_CONNECTION_ID"];
  if (!host || !identity || !connId) return null;
  try {
    const resp = await fetch(
      `https://${host}/api/v2/connection/${connId}/token`,
      { headers: { Authorization: `Bearer ${identity}` } },
    );
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "gcal: token fetch failed");
      return null;
    }
    const data = (await resp.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    logger.warn({ err }, "gcal: token fetch error");
    return null;
  }
}

export async function isGCalConnected(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

export async function listGCalEvents(
  startDate: string,
  endDate: string,
): Promise<GCalEvent[] | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const params = new URLSearchParams({
      timeMin: `${startDate}T00:00:00Z`,
      timeMax: `${endDate}T23:59:59Z`,
      singleEvents: "true",
      maxResults: "250",
    });
    const resp = await fetch(
      `${GCAL_BASE}/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "gcal: listEvents failed");
      return null;
    }
    const data = (await resp.json()) as { items?: GCalEvent[] };
    return data.items ?? [];
  } catch (err) {
    logger.warn({ err }, "gcal: listEvents error");
    return null;
  }
}

export async function createGCalEvent(event: {
  title: string;
  description?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay: boolean;
}): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const allDay = event.allDay || !event.startTime;
    const body: Record<string, unknown> = {
      summary: event.title,
      ...(event.description ? { description: event.description } : {}),
      start: allDay
        ? { date: event.date }
        : { dateTime: `${event.date}T${event.startTime}:00`, timeZone: "UTC" },
      end: allDay
        ? { date: event.date }
        : {
            dateTime: `${event.date}T${event.endTime ?? event.startTime}:00`,
            timeZone: "UTC",
          },
    };
    const resp = await fetch(`${GCAL_BASE}/calendars/primary/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "gcal: createEvent failed");
      return null;
    }
    const data = (await resp.json()) as { id?: string };
    return data.id ?? null;
  } catch (err) {
    logger.warn({ err }, "gcal: createEvent error");
    return null;
  }
}

export async function deleteGCalEvent(googleEventId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    const resp = await fetch(
      `${GCAL_BASE}/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok && resp.status !== 404) {
      logger.warn({ status: resp.status, googleEventId }, "gcal: deleteEvent failed");
    }
  } catch (err) {
    logger.warn({ err }, "gcal: deleteEvent error");
  }
}
