import assert from "node:assert/strict";
import test from "node:test";
import {
  getImprovementRequestStatusMeta,
  getLatestImprovementRequest
} from "./improvementRequestStatuses.js";

test("returns user-facing metadata for known request statuses", () => {
  assert.equal(getImprovementRequestStatusMeta("submitted")?.tone, "pending");
  assert.equal(getImprovementRequestStatusMeta("submitted")?.cardLabel, "Улучшение запрошено");
  assert.match(getImprovementRequestStatusMeta("submitted")?.details, /нескольких часов/);
  assert.equal(getImprovementRequestStatusMeta("improved")?.tone, "success");
  assert.equal(getImprovementRequestStatusMeta("unknown"), null);
});

test("selects the latest request returned by the API", () => {
  const requests = [{ id: "2" }, { id: "1" }];
  assert.equal(getLatestImprovementRequest(requests)?.id, "2");
  assert.equal(getLatestImprovementRequest([]), null);
});
