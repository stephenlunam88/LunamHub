import assert from "node:assert/strict";
import test from "node:test";

process.env["DATABASE_URL"] ??=
  "postgresql://lunam:unused@127.0.0.1:5432/lunamhub";

const { ChoreCompleteBodySchema, CreateChoreSchema } =
  await import("../src/routes/chores.js");

test("claimable chores accept no fixed assignee", () => {
  const result = CreateChoreSchema.safeParse({
    title: "Clean the kitchen",
    assignmentMode: "claimable",
    repeatType: "weekly",
    daysOfWeek: [6],
    pointsValue: 10,
  });
  assert.equal(result.success, true);
});

test("assigned chores still require a child", () => {
  const result = CreateChoreSchema.safeParse({
    title: "Clean the kitchen",
    assignmentMode: "assigned",
    repeatType: "weekly",
    daysOfWeek: [6],
    pointsValue: 10,
  });
  assert.equal(result.success, false);
});

test("one or two children can claim an occurrence, but not three", () => {
  assert.equal(
    ChoreCompleteBodySchema.safeParse({ claimantIds: [3] }).success,
    true,
  );
  assert.equal(
    ChoreCompleteBodySchema.safeParse({ claimantIds: [3, 4] }).success,
    true,
  );
  assert.equal(
    ChoreCompleteBodySchema.safeParse({ claimantIds: [3, 4, 5] }).success,
    false,
  );
});
