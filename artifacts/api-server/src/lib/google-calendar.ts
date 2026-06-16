// Google Calendar integration — uses @replit/connectors-sdk
// Proxy base path: /calendar/v3 (prepended to all Google Calendar API paths)
// Auth: Connection-Id header with the connection ID from env

import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const GCAL_PATH_BASE = "/calendar/v3";
const CONN_ID = "conn_google-calendar_01KV6ZVBT2KG2NVAWJ8RJV9R6A";

function getConnectors(): ReplitConnectors | null {
  try {
    return new ReplitConnectors();
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
  try {
    return await connectors.proxy("google-calendar", `${GCAL_PATH_BASE}${path}`, {
      method: options?.method ?? "GET",
      body: options?.body,
      headers: { "Connection-Id": CONN_ID },
    });
  } catch (err) {
    logger.warn({ err, path }, "gcal: proxy error");
    return null;
  }
}

export async function isGCalConnected(): Promise<boolean> {
  const resp = await proxyGCal("/users/me/calendarList");
  return resp !== null && resp.status >= 200 && resp.status < 300;
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

export async function createGCalEvent(event: {
  title: string;
  description?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay: boolean;
}): Promise<string | null> {
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

export async function deleteGCalEvent(googleEventId: string): Promise<void> {
  const resp = await proxyGCal(
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" },
  );
  if (resp && resp.status >= 300 && resp.status !== 404) {
    logger.warn({ status: resp.status, googleEventId }, "gcal: deleteEvent failed");
  }
}
