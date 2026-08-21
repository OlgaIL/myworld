import assert from "node:assert/strict";
import test from "node:test";
import {
  canRequestPhotoImprovement,
  mapImprovementRequest,
  validateImprovementRequestInput
} from "../services/improvementRequestService.js";

test("requires explicit consent and normalizes an optional comment", () => {
  assert.deepEqual(validateImprovementRequestInput({ comment: "Text" }), {
    error: "MANUAL_REVIEW_CONSENT_REQUIRED"
  });
  assert.deepEqual(
    validateImprovementRequestInput({ manualReviewConsent: true, comment: "  Ошибка в таблице  " }),
    { comment: "Ошибка в таблице" }
  );
});

test("rejects comments longer than the database limit", () => {
  assert.deepEqual(
    validateImprovementRequestInput({ manualReviewConsent: true, comment: "a".repeat(1001) }),
    { error: "IMPROVEMENT_COMMENT_TOO_LONG" }
  );
});

test("allows requests for low-confidence and no-meaningful-text photos", () => {
  assert.equal(canRequestPhotoImprovement({ status: "processed", text_quality: "low_confidence" }), true);
  assert.equal(canRequestPhotoImprovement({ status: "processed", text_quality: "full_text" }), false);
  assert.equal(canRequestPhotoImprovement({ status: "no_text", text_quality: "no_meaningful_text" }), true);
  assert.equal(canRequestPhotoImprovement({ status: "processing", text_quality: "low_confidence" }), false);
});

test("maps only public request fields", () => {
  const mapped = mapImprovementRequest({
    id: 12,
    filename: "photo.jpg",
    status: "submitted",
    user_comment: "Проверьте второй столбец",
    manual_review_consent_at: "2026-08-21T09:00:00.000Z",
    consent_version: "2026-08-21",
    created_at: "2026-08-21T09:00:00.000Z",
    updated_at: "2026-08-21T09:00:00.000Z",
    started_at: null,
    completed_at: null,
    storage_path: "C:/private/photo.jpg"
  });

  assert.equal(mapped.id, "12");
  assert.equal(mapped.documentId, "photo.jpg");
  assert.equal(mapped.consentVersion, "2026-08-21");
  assert.equal("storagePath" in mapped, false);
});
