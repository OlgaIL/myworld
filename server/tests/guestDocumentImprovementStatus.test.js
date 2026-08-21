import assert from "node:assert/strict";
import test from "node:test";
import { mapGuestDocumentInfo } from "../utils/guest.js";

test("exposes only the public improvement request status for a claimed guest document", () => {
  const mapped = mapGuestDocumentInfo({
    id: 15,
    filename: "guest.jpg",
    status: "claimed",
    tags: [],
    improvement_request_id: 9,
    improvement_request_status: "submitted",
    improvement_request_created_at: "2026-08-21T10:00:00.000Z",
    improvement_request_updated_at: "2026-08-21T10:00:00.000Z"
  });

  assert.deepEqual(mapped.improvementRequest, {
    id: "9",
    status: "submitted",
    createdAt: "2026-08-21T10:00:00.000Z",
    updatedAt: "2026-08-21T10:00:00.000Z"
  });
});

test("does not invent an improvement request for an unclaimed guest document", () => {
  const mapped = mapGuestDocumentInfo({
    id: 16,
    filename: "guest.jpg",
    status: "processed",
    tags: []
  });

  assert.equal(mapped.improvementRequest, null);
});
