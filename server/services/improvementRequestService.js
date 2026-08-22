export const IMPROVEMENT_REQUEST_COMMENT_LIMIT = 1000;
export const MANUAL_REVIEW_CONSENT_VERSION = "2026-08-21";

export function validateImprovementRequestInput(body) {
  if (body?.manualReviewConsent !== true) {
    return { error: "MANUAL_REVIEW_CONSENT_REQUIRED" };
  }

  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
  if (comment.length > IMPROVEMENT_REQUEST_COMMENT_LIMIT) {
    return { error: "IMPROVEMENT_COMMENT_TOO_LONG" };
  }

  return { comment };
}

export function canRequestPhotoImprovement(photo) {
  return (
    photo?.status === "processed" && photo?.has_recognition_errors === true
  ) || (
    photo?.status === "no_text" && photo?.text_quality === "no_meaningful_text"
  );
}

export function mapImprovementRequest(request, documentId = null) {
  const mapped = {
    id: String(request.id),
    documentId: documentId || request.filename || null,
    status: request.status,
    comment: request.user_comment || "",
    manualReviewConsentAt: request.manual_review_consent_at,
    consentVersion: request.consent_version,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    startedAt: request.started_at,
    completedAt: request.completed_at
  };

  if (request.status === "improved") {
    mapped.originalOcrText = request.original_ocr_text || "";
    mapped.originalCleanText = request.original_clean_text || "";
    mapped.improvedText = request.improved_text || "";
  }

  return mapped;
}
