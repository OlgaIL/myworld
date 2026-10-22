import assert from "node:assert/strict";
import test from "node:test";
import { userRemaining, userRowHighlights, userProcessingUsage } from "../src/utils/adminUsers.js";

test("remaining combines unused free allowance and package quota without negative balances", () => {
  assert.equal(userRemaining({ recordLimit: 5, recordsProcessedTotal: 3, processingQuota: 10, processingUsed: 4 }), 8);
  assert.equal(userRemaining({ recordLimit: 5, recordsProcessedTotal: 20, processingQuota: 10, processingUsed: 99 }), 0);
  assert.equal(userRemaining({}), 0);
});

test("unlimited access and future access deadline override numeric balance", () => {
  assert.equal(userRemaining({ processingEnabled: true }), "Без ограничений");
  assert.equal(userRemaining({ accessExpiresAt: "2099-01-01T00:00:00Z" }), "Без ограничений");
  assert.equal(userRemaining({ accessExpiresAt: "2000-01-01T00:00:00Z" }), 0);
});

test("today follows Istanbul midnight and purchase highlighting excludes manual quota", () => {
  const now = new Date("2026-10-21T21:30:00Z");
  assert.deepEqual(userRowHighlights({ createdAt: "2026-10-21T21:00:00Z", hasSuccessfulPurchase: true }, now), { today: true, paid: true });
  assert.deepEqual(userRowHighlights({ createdAt: "2026-10-21T20:59:59Z", processingQuota: 100 }, now), { today: false, paid: false });
});

test("compact usage preserves separate free and package figures", () => {
  assert.equal(userProcessingUsage({ recordLimit: 5, recordsProcessedTotal: 8, processingQuota: 10, processingUsed: 3 }), "бесплатно 5 из 5 · платный пакет 3 из 10");
});
