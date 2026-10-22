import assert from "node:assert/strict";
import test from "node:test";
import { formatDashboardEvent } from "../src/lib/dashboardEvent.ts";

test("dashboard event serialization includes location and recurrence details", () => {
  const createdAt = new Date("2026-10-21T01:00:00.000Z");
  const event = formatDashboardEvent(
    {
      id: 42,
      title: "Basketball",
      description: null,
      location: "Penrith Stadium",
      date: "2026-10-20",
      startTime: "18:00",
      endTime: "19:00",
      allDay: false,
      category: "sport",
      recurrence: "WEEKLY",
      recurrenceEndDate: "2026-12-31",
      recurrenceDays: "2",
      recurrenceExceptions: "2026-10-27",
      googleEventId: null,
      createdAt,
    },
    [7, 9],
  );

  assert.equal(event.location, "Penrith Stadium");
  assert.equal(event.seriesDate, "2026-10-20");
  assert.equal(event.recurrence, "WEEKLY");
  assert.equal(event.recurrenceExceptions, "2026-10-27");
  assert.deepEqual(event.assignedMembers, [7, 9]);
  assert.equal(event.createdAt, createdAt.toISOString());
});
