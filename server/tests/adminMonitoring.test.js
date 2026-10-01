import assert from "node:assert/strict";
import test from "node:test";
import { getLlmAttemptSummary } from "../services/llmAttemptSummaryService.js";
import {
  clearPresenceForTests,
  countPaidActiveUsers,
  getPresenceSnapshot,
  recordPresence
} from "../services/presenceService.js";

test("summarizes LLM outcomes without document content", async () => {
  const summary = await getLlmAttemptSummary(24, async (sql, params) => {
    assert.match(sql, /from llm_attempt_events/);
    assert.deepEqual(params, [24]);
    return { rows: [
      { audience: "guest", provider: "yandex", trigger: "upload", attempts: 10, successes: 7, timeouts: 2, other_errors: 1, average_duration_ms: 9000 },
      { audience: "free", provider: "yandex", trigger: "upload", attempts: 2, successes: 2, timeouts: 0, other_errors: 0, average_duration_ms: 6000 }
    ] };
  });
  assert.deepEqual(summary.totals, { attempts: 12, successes: 9, timeouts: 2, otherErrors: 1, successPercent: 75 });
  assert.equal(summary.groups[0].audience, "guest");
  assert.equal(JSON.stringify(summary).includes("document"), false);
  await assert.rejects(getLlmAttemptSummary(3), RangeError);
});

test("presence deduplicates browser activity and expires inactive visitors", () => {
  clearPresenceForTests();
  const first = recordPresence(null, null, 1000);
  recordPresence(first.id, 42, 2000);
  recordPresence(null, null, 2500);
  assert.deepEqual(getPresenceSnapshot(3000), { total: 2, authenticated: 1, userIds: ["42"] });
  assert.equal(getPresenceSnapshot(125001).total, 0);
  clearPresenceForTests();
});

test("paid presence requires confirmed payment and remaining quota", async () => {
  assert.equal(await countPaidActiveUsers([]), 0);
  const count = await countPaidActiveUsers(["42", "invalid"], async (sql, params) => {
    assert.match(sql, /payments.status = 'succeeded'/);
    assert.match(sql, /processing_quota > processing_used/);
    assert.deepEqual(params, [["42"]]);
    return { rows: [{ paid: 1 }] };
  });
  assert.equal(count, 1);
});
