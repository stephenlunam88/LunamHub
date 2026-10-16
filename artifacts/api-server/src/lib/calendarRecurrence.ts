import { calendarLocalTime } from "./calendarTime";

export interface RecurringEvent {
  date: string;
  recurrence?: string | null;
  recurrenceEndDate?: string | null;
  recurrenceDays?: string | null;
  recurrenceExceptions?: string | null;
}

/** Import only rules the local editor can round-trip without changing meaning. */
export function parseGoogleRecurrence(
  lines: string[] = [],
  timeZone = "Australia/Sydney",
) {
  const rule = lines.find((line) => line.startsWith("RRULE:"));
  if (!rule)
    return { recurrence: null, recurrenceDays: null, recurrenceEndDate: null };
  const fields: Record<string, string> = Object.fromEntries(
    rule
      .slice(6)
      .split(";")
      .map((value) => value.split("=")),
  );
  if (
    Object.keys(fields).some(
      (key) => !["FREQ", "INTERVAL", "BYDAY", "UNTIL", "WKST"].includes(key),
    ) ||
    (fields.WKST && fields.WKST !== "MO") ||
    (fields.INTERVAL &&
      fields.INTERVAL !== "1" &&
      !(fields.FREQ === "WEEKLY" && fields.INTERVAL === "2"))
  ) {
    throw new Error(
      "This Google recurrence rule cannot be edited safely in LunamHub.",
    );
  }
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(fields.FREQ))
    throw new Error("Unsupported recurrence frequency");
  const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const days = fields.BYDAY?.split(",");
  if (
    days &&
    (fields.FREQ !== "WEEKLY" || days.some((day) => !weekdays.includes(day)))
  )
    throw new Error("Unsupported recurrence weekdays");
  let recurrenceEndDate = fields.UNTIL
    ? `${fields.UNTIL.slice(0, 4)}-${fields.UNTIL.slice(4, 6)}-${fields.UNTIL.slice(6, 8)}`
    : null;
  if (recurrenceEndDate && fields.UNTIL.includes("T")) {
    const until = fields.UNTIL;
    recurrenceEndDate = calendarLocalTime(
      `${recurrenceEndDate}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}Z`,
      timeZone,
    ).date;
  }
  return {
    recurrence:
      fields.FREQ === "WEEKLY" && fields.INTERVAL === "2"
        ? "FORTNIGHTLY"
        : fields.FREQ,
    recurrenceDays: days
      ? days.map((day) => weekdays.indexOf(day)).join(",")
      : null,
    recurrenceEndDate,
  };
}

export function occursOn(event: RecurringEvent, date: string): boolean {
  if (
    date < event.date ||
    (event.recurrenceEndDate && date > event.recurrenceEndDate)
  )
    return false;
  if (event.recurrenceExceptions?.split(",").includes(date)) return false;
  if (!event.recurrence) return date === event.date;
  const start = new Date(`${event.date}T00:00:00Z`);
  const day = new Date(`${date}T00:00:00Z`);
  const weekdays = event.recurrenceDays?.split(",").map(Number) ?? [
    start.getUTCDay(),
  ];
  switch (event.recurrence) {
    case "DAILY":
      return true;
    case "WEEKLY":
      return weekdays.includes(day.getUTCDay());
    case "FORTNIGHTLY": {
      // Google RRULE's default week start is Monday.
      const startWeek =
        start.getTime() - ((start.getUTCDay() + 6) % 7) * 86400000;
      const dayWeek = day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000;
      return (
        weekdays.includes(day.getUTCDay()) &&
        Math.round((dayWeek - startWeek) / 604800000) % 2 === 0
      );
    }
    case "MONTHLY":
      return start.getUTCDate() === day.getUTCDate();
    case "YEARLY":
      return (
        start.getUTCDate() === day.getUTCDate() &&
        start.getUTCMonth() === day.getUTCMonth()
      );
    default:
      return event.date === date;
  }
}
