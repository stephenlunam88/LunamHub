import assert from "node:assert/strict";
import test from "node:test";
import { UpdateEventBody } from "@workspace/api-zod";
import {
  calendarEndDate,
  calendarLocalTime,
  collectCalendarPages,
  localTimeToUTC,
  nextCalendarDay,
} from "../src/lib/calendarTime.ts";
import {
  occursOn,
  parseGoogleRecurrence,
} from "../src/lib/calendarRecurrence.ts";

test("UTC and explicit offsets identify the same household date and time", () => {
  assert.deepEqual(
    calendarLocalTime("2026-10-15T22:30:00Z", "Australia/Sydney"),
    {
      date: "2026-10-16",
      time: "09:30",
      seconds: "00",
    },
  );
  assert.deepEqual(
    calendarLocalTime("2026-10-16T09:30:00+11:00", "Australia/Sydney"),
    calendarLocalTime("2026-10-15T22:30:00Z", "Australia/Sydney"),
  );
});

test("query boundaries use household midnight and an exclusive next day", () => {
  assert.equal(
    localTimeToUTC("2026-10-01", "00:00", "Australia/Sydney"),
    "2026-09-30T14:00:00.000Z",
  );
  assert.equal(
    localTimeToUTC(nextCalendarDay("2026-10-31"), "00:00", "Australia/Sydney"),
    "2026-10-31T13:00:00.000Z",
  );
});

test("timed events ending at or after midnight use the following calendar day", () => {
  assert.equal(calendarEndDate("2026-10-17", "19:00", "00:00"), "2026-10-18");
  assert.equal(calendarEndDate("2026-10-17", "19:00", "23:59"), "2026-10-17");
  assert.equal(calendarEndDate("2026-10-17", "09:00", "09:00"), "2026-10-18");
  assert.equal(
    localTimeToUTC(
      calendarEndDate("2026-10-17", "19:00", "00:00"),
      "00:00",
      "Australia/Sydney",
    ),
    "2026-10-17T13:00:00.000Z",
  );
});

test("event updates accept clearing timed event fields", () => {
  assert.deepEqual(
    UpdateEventBody.parse({ startTime: null, endTime: null }),
    { startTime: null, endTime: null },
  );
});

test("DST transition resolves the offset at the event, not noon", () => {
  assert.equal(
    localTimeToUTC("2026-10-04", "01:30", "Australia/Sydney"),
    "2026-10-03T15:30:00.000Z",
  );
  assert.equal(
    localTimeToUTC("2026-10-04", "03:30", "Australia/Sydney"),
    "2026-10-03T16:30:00.000Z",
  );
  assert.throws(
    () => localTimeToUTC("2026-10-04", "02:30", "Australia/Sydney"),
    /does not exist/,
  );
});

test("fetches every page, including an empty intermediate page", async () => {
  const calls: (string | undefined)[] = [];
  const result = await collectCalendarPages<number>(async (token) => {
    calls.push(token);
    if (!token)
      return {
        items: Array.from({ length: 250 }, (_, index) => index),
        nextPageToken: "second",
      };
    if (token === "second") return { items: [], nextPageToken: "third" };
    return { items: [250] };
  });
  assert.equal(result.length, 251);
  assert.deepEqual(calls, [undefined, "second", "third"]);
});

test("failed later pages reject the entire snapshot", async () => {
  await assert.rejects(
    collectCalendarPages(async (token) => {
      if (token) throw new Error("Google temporarily unavailable");
      return { items: [1], nextPageToken: "second" };
    }),
    /temporarily unavailable/,
  );
});

test("repeated pagination tokens cannot loop forever", async () => {
  await assert.rejects(
    collectCalendarPages(async () => ({ items: [], nextPageToken: "same" })),
    /Repeated/,
  );
});

test("weekly selected days and exceptions agree with the calendar", () => {
  const event = {
    date: "2026-10-05",
    recurrence: "WEEKLY",
    recurrenceDays: "1,3",
    recurrenceExceptions: "2026-10-14",
  };
  assert.equal(occursOn(event, "2026-10-07"), true);
  assert.equal(occursOn(event, "2026-10-08"), false);
  assert.equal(occursOn(event, "2026-10-14"), false);
});

test("fortnightly recurrence uses Google's Monday week boundary across DST", () => {
  const event = {
    date: "2026-09-27",
    recurrence: "FORTNIGHTLY",
    recurrenceDays: "0,1",
  };
  assert.equal(occursOn(event, "2026-09-28"), false);
  assert.equal(occursOn(event, "2026-10-05"), true);
  assert.equal(occursOn(event, "2026-10-11"), true);
  assert.equal(occursOn(event, "2026-10-12"), false);
});

test("monthly events on the 31st do not overflow into the following month", () => {
  const event = { date: "2026-01-31", recurrence: "MONTHLY" };
  assert.equal(occursOn(event, "2026-02-28"), false);
  assert.equal(occursOn(event, "2026-03-03"), false);
  assert.equal(occursOn(event, "2026-03-31"), true);
});

test("imports fortnightly Google rules and inclusive household UNTIL dates", () => {
  assert.deepEqual(
    parseGoogleRecurrence([
      "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261030T125900Z",
    ]),
    {
      recurrence: "FORTNIGHTLY",
      recurrenceDays: "1,3",
      recurrenceEndDate: "2026-10-30",
    },
  );
});

test("unsupported rules fail explicitly instead of changing the schedule", () => {
  assert.throws(
    () => parseGoogleRecurrence(["RRULE:FREQ=MONTHLY;BYDAY=2MO"]),
    /Unsupported/,
  );
  assert.throws(
    () => parseGoogleRecurrence(["RRULE:FREQ=WEEKLY;COUNT=6"]),
    /cannot be edited safely/,
  );
});
