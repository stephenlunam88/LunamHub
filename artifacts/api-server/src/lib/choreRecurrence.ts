const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function epochDay(value: string): number | null {
  const match = DATE_KEY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp / DAY_MS;
}

export function isCalendarDate(value: string): boolean {
  return epochDay(value) !== null;
}

/** True only on the anchor date and exact 14-day intervals after it. */
export function isFortnightlyOccurrence(
  startDate: string,
  targetDate: string,
): boolean {
  const start = epochDay(startDate);
  const target = epochDay(targetDate);
  if (start === null || target === null || target < start) return false;
  return (target - start) % 14 === 0;
}

/** Used by tests and range consumers; duplicate input dates yield one result. */
export function fortnightlyOccurrences(
  startDate: string,
  targetDates: readonly string[],
): string[] {
  return [...new Set(targetDates)].filter((date) =>
    isFortnightlyOccurrence(startDate, date),
  );
}
