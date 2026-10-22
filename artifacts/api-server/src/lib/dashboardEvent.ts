import { eventsTable } from "@workspace/db";

export function formatDashboardEvent(
  event: typeof eventsTable.$inferSelect,
  assignedMembers: number[] = [],
) {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    date: event.date,
    seriesDate: event.date,
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
    allDay: event.allDay,
    category: event.category,
    recurrence: event.recurrence ?? null,
    recurrenceEndDate: event.recurrenceEndDate ?? null,
    recurrenceDays: event.recurrenceDays ?? null,
    recurrenceExceptions: event.recurrenceExceptions ?? null,
    assignedMembers,
    createdAt: event.createdAt.toISOString(),
  };
}
