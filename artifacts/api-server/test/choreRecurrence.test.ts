import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  choreInstanceClaimantsTable,
  choreInstancesTable,
} from "../../../lib/db/src/schema/index.js";
import {
  fortnightlyOccurrences,
  isCalendarDate,
  isFortnightlyOccurrence,
} from "../src/lib/choreRecurrence.js";

test("fortnightly chores stay anchored across month boundaries", () => {
  assert.equal(isFortnightlyOccurrence("2026-11-03", "2026-11-03"), true);
  assert.equal(isFortnightlyOccurrence("2026-11-03", "2026-11-17"), true);
  assert.equal(isFortnightlyOccurrence("2026-11-03", "2026-12-01"), true);
  assert.equal(isFortnightlyOccurrence("2026-11-03", "2026-11-10"), false);
  assert.equal(isFortnightlyOccurrence("2026-11-03", "2026-10-20"), false);
});

test("claimable occurrences and their claimants have duplicate guards", () => {
  const instanceConfig = getTableConfig(choreInstancesTable);
  const sharedIndex = instanceConfig.indexes.find(
    (index) => index.config.name === "unique_claimable_chore_instance_per_day",
  );
  assert.ok(sharedIndex?.config.unique);

  const claimantConfig = getTableConfig(choreInstanceClaimantsTable);
  const claimantConstraint = claimantConfig.uniqueConstraints.find(
    (constraint) => constraint.name === "unique_chore_instance_claimant",
  );
  assert.ok(claimantConstraint);
  assert.deepEqual(
    claimantConstraint.columns.map((column) => column.name),
    ["instance_id", "child_id"],
  );
});

test("fortnightly chores stay anchored across year boundaries", () => {
  assert.equal(isFortnightlyOccurrence("2026-12-22", "2027-01-05"), true);
  assert.equal(isFortnightlyOccurrence("2026-12-22", "2027-01-19"), true);
  assert.equal(isFortnightlyOccurrence("2026-12-22", "2027-01-12"), false);
});

test("fortnightly occurrence selection rejects invalid dates and deduplicates", () => {
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.deepEqual(
    fortnightlyOccurrences("2026-11-03", [
      "2026-11-03",
      "2026-11-03",
      "2026-11-10",
      "2026-11-17",
      "2026-11-17",
    ]),
    ["2026-11-03", "2026-11-17"],
  );
});

test("chore instances enforce one occurrence per template, child, and date", () => {
  const config = getTableConfig(choreInstancesTable);
  const recurrenceConstraint = config.uniqueConstraints.find(
    (constraint) => constraint.name === "unique_chore_instance_per_day",
  );

  assert.ok(recurrenceConstraint);
  assert.deepEqual(
    recurrenceConstraint.columns.map((column) => column.name),
    ["template_id", "child_id", "due_date"],
  );
});
