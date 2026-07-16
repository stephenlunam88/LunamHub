const DEFAULT_HOUSEHOLD_TIME_ZONE = "Australia/Sydney";

export function householdTimeZone(): string {
  return process.env["HOUSEHOLD_TIME_ZONE"] || DEFAULT_HOUSEHOLD_TIME_ZONE;
}

export function householdDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: householdTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
