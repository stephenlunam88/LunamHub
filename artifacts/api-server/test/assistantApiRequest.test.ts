import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAssistantApiRequest,
  summarizeAssistantApiAction,
} from "../src/lib/assistantApiRequest.ts";

test("normalizes shopping list item name to the API text field", () => {
  assert.deepEqual(
    normalizeAssistantApiRequest("POST", "/lists/1/items", { name: "Milk" }),
    { text: "Milk" },
  );
});

test("does not alter other API requests or explicit text values", () => {
  const explicit = { name: "Milk", text: "Oat milk" };
  assert.equal(
    normalizeAssistantApiRequest("POST", "/lists/1/items", explicit),
    explicit,
  );
  assert.equal(
    normalizeAssistantApiRequest("POST", "/events", { name: "Milk" })?.name,
    "Milk",
  );
});

test("summarizes list writes without exposing endpoint IDs", () => {
  assert.equal(
    summarizeAssistantApiAction("POST", "/lists/1/items", { name: "Milk" }),
    "Add “Milk” to the shopping list",
  );
});
