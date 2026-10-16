import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordLoginFailure,
} from "../src/lib/loginThrottle.ts";

test("blocks a login key after five failures and can be cleared", () => {
  const key = "test-client";
  clearLoginFailures(key);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    recordLoginFailure(key, 1_000);
    assert.equal(isLoginBlocked(key, 1_000), false);
  }
  recordLoginFailure(key, 1_000);
  assert.equal(isLoginBlocked(key, 1_000), true);
  clearLoginFailures(key);
  assert.equal(isLoginBlocked(key, 1_000), false);
});

test("expired failures do not remain blocked", () => {
  const key = "expired-client";
  clearLoginFailures(key);
  for (let attempt = 0; attempt < 5; attempt += 1)
    recordLoginFailure(key, 1_000);
  assert.equal(isLoginBlocked(key, 1_000 + 16 * 60 * 1_000), false);
});
