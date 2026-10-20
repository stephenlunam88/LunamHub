type TimedEvent = {
  allDay: boolean;
  startTime: string | null;
  title: string;
};

function timeInMinutes(time: string | null): number {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.MAX_SAFE_INTEGER;
  return hours * 60 + minutes;
}

export function compareEventsByTime(a: TimedEvent, b: TimedEvent): number {
  return (
    Number(b.allDay) - Number(a.allDay) ||
    timeInMinutes(a.startTime) - timeInMinutes(b.startTime) ||
    a.title.localeCompare(b.title)
  );
}
