import assert from "node:assert/strict";
import test from "node:test";
import { calculateChoreStreak, type StreakInstance } from "../src/lib/choreStreak.ts";

const childId = 1;
const today = "2026-07-16";

function instance(dueDate: string, status = "done"): StreakInstance {
  return { childId, dueDate, status };
}

test("includes today as soon as every chore due today is done", () => {
  const result = calculateChoreStreak([
    instance("2026-07-15"),
    instance(today),
    instance(today),
  ], childId, today);

  assert.deepEqual(result, { current: 2, longest: 2 });
});

test("an unfinished current day does not break the existing streak", () => {
  const result = calculateChoreStreak([
    instance("2026-07-14"),
    instance("2026-07-15"),
    instance(today, "todo"),
  ], childId, today);

  assert.deepEqual(result, { current: 2, longest: 2 });
});

test("skips unscheduled dates between successful scheduled days", () => {
  const result = calculateChoreStreak([
    instance("2026-07-10"),
    instance("2026-07-15"),
  ], childId, today);

  assert.deepEqual(result, { current: 2, longest: 2 });
});

test("a past scheduled day is successful only when all its chores are done", () => {
  const result = calculateChoreStreak([
    instance("2026-07-13"),
    instance("2026-07-14"),
    instance("2026-07-14", "missed"),
    instance("2026-07-15"),
  ], childId, today);

  assert.deepEqual(result, { current: 1, longest: 1 });
});

test("uses due dates rather than approval dates", () => {
  const lateApprovalHistory = [
    instance("2026-07-12"),
    instance("2026-07-13"),
    instance("2026-07-14"),
  ];

  assert.deepEqual(
    calculateChoreStreak(lateApprovalHistory, childId, today),
    { current: 3, longest: 3 },
  );
});

test("a fully excused away day pauses but does not break or extend a streak", () => {
  const result = calculateChoreStreak(
    [
      instance("2026-07-13"),
      instance("2026-07-14", "excused"),
      instance("2026-07-15"),
    ],
    childId,
    today,
  );

  assert.deepEqual(result, { current: 2, longest: 2 });
});

test("an excused chore does not cover another unfinished chore that day", () => {
  const result = calculateChoreStreak(
    [
      instance("2026-07-14", "todo"),
      instance("2026-07-14", "excused"),
      instance("2026-07-15"),
    ],
    childId,
    today,
  );

  assert.deepEqual(result, { current: 1, longest: 1 });
});

test("a skipped chore breaks the streak rather than pausing it", () => {
  const result = calculateChoreStreak(
    [
      instance("2026-07-13"),
      instance("2026-07-14", "skipped"),
      instance("2026-07-15"),
    ],
    childId,
    today,
  );

  assert.deepEqual(result, { current: 1, longest: 1 });
});

test("a day with completed and excused chores still counts as a success", () => {
  const result = calculateChoreStreak(
    [instance("2026-07-15"), instance("2026-07-15", "excused")],
    childId,
    today,
  );

  assert.deepEqual(result, { current: 1, longest: 1 });
});
