/** Convert an instant to household wall-clock fields; never discard its offset. */
export function calendarLocalTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid calendar timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    seconds: get("second"),
  };
}

export function nextCalendarDay(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** Resolve the offset at the actual event time, including DST transition days. */
export function localTimeToUTC(
  date: string,
  time: string,
  timeZone: string,
): string {
  const target = Date.parse(`${date}T${time}:00Z`);
  let instant = target;
  for (let attempt = 0; attempt < 5; attempt++) {
    const local = calendarLocalTime(new Date(instant).toISOString(), timeZone);
    const difference =
      target - Date.parse(`${local.date}T${local.time}:${local.seconds}Z`);
    if (difference === 0) return new Date(instant).toISOString();
    instant += difference;
  }
  throw new Error(
    "This local time does not exist because of daylight saving. Choose another time.",
  );
}

/** A partial page must never look like a successful empty calendar. */
export async function collectCalendarPages<T>(
  fetchPage: (
    pageToken?: string,
  ) => Promise<{ items?: T[]; nextPageToken?: string }>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  do {
    const page = await fetchPage(token);
    items.push(...(page.items ?? []));
    token = page.nextPageToken;
    if (token && seen.has(token))
      throw new Error("Repeated Google Calendar page token");
    if (token) seen.add(token);
  } while (token);
  return items;
}
