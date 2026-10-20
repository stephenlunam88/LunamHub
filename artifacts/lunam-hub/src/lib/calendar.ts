export function eventTimeInMinutes(time: string | null | undefined): number {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.MAX_SAFE_INTEGER;
  return hours * 60 + minutes;
}
