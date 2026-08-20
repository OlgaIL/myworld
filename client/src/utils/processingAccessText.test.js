import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableProcessingCount,
  getProcessingBalanceProgress,
  getProcessingUsageText
} from "./processingAccessText.js";

test("returns the current total balance for a paid user", () => {
  assert.equal(getAvailableProcessingCount({
    packageQuota: 50,
    recordsRemaining: 24,
    packageRemaining: 50
  }), 74);
});

test("formats free, paid and unlimited processing usage", () => {
  assert.equal(getProcessingUsageText({ recordsProcessedTotal: 5, recordLimit: 30 }), "Обработок: 5 из 30");
  assert.equal(getProcessingUsageText({ processingQuota: 50, processingUsed: 7 }), "Обработок: 7 из 50");
  assert.equal(
    getProcessingUsageText({ processingEnabled: true, recordsProcessedTotal: 125 }),
    "Обработок: 125 всего"
  );
});

test("builds balance progress for free and paid access", () => {
  assert.deepEqual(
    getProcessingBalanceProgress({ recordsRemaining: 15, recordLimit: 30 }),
    { available: 15, total: 30, percentage: 50, tone: "healthy" }
  );
  assert.deepEqual(
    getProcessingBalanceProgress({ packageQuota: 50, packageRemaining: 0, recordsRemaining: 4, recordLimit: 30 }),
    { available: 4, total: 80, percentage: 5, tone: "danger" }
  );
  assert.equal(getProcessingBalanceProgress({ unlimitedAccess: true, recordLimit: 30 }), null);
});
