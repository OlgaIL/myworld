import assert from "node:assert/strict";
import { test } from "node:test";
import { getAdminSettings } from "../routes/adminRoutes.js";
import { getProcessingPipelineForUser } from "../services/processingPipelineService.js";

test("admin processing settings resolve each audience separately", () => {
  const { guest, free, paid } = getAdminSettings().processing.pipelines;

  assert.deepEqual(guest, getProcessingPipelineForUser(null, { audience: "guest" }));
  assert.deepEqual(free, getProcessingPipelineForUser({}, { audience: "free" }));
  assert.deepEqual(paid, getProcessingPipelineForUser({}, { audience: "paid" }));
  assert.equal(guest.audience, "guest");
  assert.equal(free.audience, "free");
  assert.equal(paid.audience, "paid");
});
