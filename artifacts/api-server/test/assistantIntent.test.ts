import assert from "node:assert/strict";
import test from "node:test";
import { needsCalendarLookupForRemoval } from "../src/lib/assistantIntent.ts";

test("calendar removal requests force a calendar lookup", () => {
  assert.equal(
    needsCalendarLookupForRemoval([
      { role: "user", content: "Remove Honor's Swimming event tomorrow." },
    ]),
    true,
  );
});

test("a find-it follow-up continues a pending calendar removal lookup", () => {
  assert.equal(
    needsCalendarLookupForRemoval([
      { role: "user", content: "Honor has swimming tomorrow at 1pm" },
      { role: "user", content: "You didn't remove it" },
      {
        role: "assistant",
        content:
          "I can remove Honor's Swimming event, but need to find the event first.",
      },
      { role: "user", content: "Ok find it" },
    ]),
    true,
  );
});

test("an implicit cancellation request triggers an immediate calendar lookup", () => {
  assert.equal(
    needsCalendarLookupForRemoval([
      {
        role: "user",
        content: "Honor doesn't have swimming at 1pm tomorrow anymore",
      },
    ]),
    true,
  );
});

test("a direct remove-it follow-up triggers a calendar lookup", () => {
  assert.equal(
    needsCalendarLookupForRemoval([
      { role: "user", content: "Honor has swimming tomorrow at 1pm" },
      {
        role: "assistant",
        content:
          "I found Honor's swimming at 1:00pm tomorrow. I'm ready to remove that event.",
      },
      { role: "user", content: "Remove it." },
    ]),
    true,
  );
});

test("unrelated conversation does not force a calendar lookup", () => {
  assert.equal(
    needsCalendarLookupForRemoval([
      { role: "user", content: "How is the weather tomorrow?" },
    ]),
    false,
  );
});
