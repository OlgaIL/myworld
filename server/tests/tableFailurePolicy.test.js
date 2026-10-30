import assert from "node:assert/strict";
import test from "node:test";
import { tableFailurePolicy, providerRetryAfter } from "../utils/tableFailurePolicy.js";

test("only transient failures allow the same table request again", () => {
  for (const code of ["TABLE_TIMEOUT", "TABLE_PROVIDER_LIMIT", "TABLE_PROVIDER_UNAVAILABLE"]) {
    assert.deepEqual(tableFailurePolicy("error", code), { retryable: true, kind: "temporary" });
  }
  assert.deepEqual(tableFailurePolicy("review", "TABLE_INVALID_STRUCTURE"), { retryable: false, kind: "quality" });
  assert.deepEqual(tableFailurePolicy("no_tables", null), { retryable: false, kind: "quality" });
  assert.equal(tableFailurePolicy("review", "TABLE_SOURCE_REUPLOAD_REQUIRED").kind, "source");
  assert.equal(tableFailurePolicy("error", "TABLE_PROVIDER_AUTH").retryable, false);
  assert.equal(tableFailurePolicy("ready", null).kind, null);
});

test("provider rate limit honors seconds, date and a safe default", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  assert.equal(providerRetryAfter({ headers: new Headers({ "retry-after": "90" }) }, now), "2026-10-24T12:01:30.000Z");
  assert.equal(providerRetryAfter({ headers: { "retry-after": "Sat, 24 Oct 2026 12:02:00 GMT" } }, now), "2026-10-24T12:02:00.000Z");
  assert.equal(providerRetryAfter({}, now), "2026-10-24T12:01:00.000Z");
});
