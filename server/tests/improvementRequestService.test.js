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

test("allows requests for recognition errors and no-meaningful-text photos", () => {
  assert.equal(canRequestPhotoImprovement({ status: "processed", text_quality: "fragment", has_recognition_errors: true }), true);
  assert.equal(canRequestPhotoImprovement({ status: "processed", text_quality: "low_confidence", has_recognition_errors: false }), false);
  assert.equal(canRequestPhotoImprovement({ status: "processed", text_quality: "full_text", has_recognition_errors: false }), false);
  assert.equal(canRequestPhotoImprovement({ status: "no_text", text_quality: "no_meaningful_text" }), true);
  assert.equal(canRequestPhotoImprovement({ status: "processing", has_recognition_errors: true }), false);
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
    viewed_at: null,
    storage_path: "C:/private/photo.jpg"
  });

  assert.equal(mapped.id, "12");
  assert.equal(mapped.documentId, "photo.jpg");
  assert.equal(mapped.consentVersion, "2026-08-21");
  assert.equal(mapped.viewedAt, null);
  assert.equal("storagePath" in mapped, false);
});

test("exposes text versions only for a completed improvement", () => {
  const pending = mapImprovementRequest({ id: 1, status: "in_review" });
  const improved = mapImprovementRequest({
    id: 2,
    status: "improved",
    original_ocr_text: "OCR",
    original_clean_text: "Первый текст",
    improved_text: "Улучшенный текст"
  });

  assert.equal("improvedText" in pending, false);
  assert.equal(improved.originalOcrText, "OCR");
  assert.equal(improved.originalCleanText, "Первый текст");
  assert.equal(improved.improvedText, "Улучшенный текст");
});
