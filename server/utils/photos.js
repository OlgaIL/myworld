import {
  AI_PROVIDER,
  GOOGLE_OCR_ENABLED,
  OCR_PROVIDER,
  OPENAI_ENABLED,
  PROCESSING_ALLOWLIST_EMAILS,
  PROCESSING_ENABLED,
  YANDEX_AI_ENABLED,
  YANDEX_OCR_ENABLED
} from "../config/env.js";

export function mapPhotoInfo(photo) {
  return {
    id: photo.filename,
    filename: photo.filename,
    status: photo.status,
    text: photo.ocr_text || "",
    title: photo.title || "",
    summary: photo.summary || "",
    tags: Array.isArray(photo.tags) ? photo.tags : [],
    error: photo.error_message || null,
    createdAt: photo.created_at
  };
}

export function getUserProcessingAccess(user) {
  const processingQuota = Number(user?.processingQuota || 0);
  const processingUsed = Number(user?.processingUsed || 0);
  const processingUnlimited = Boolean(user?.processingEnabled);
  const processingRemaining = Math.max(processingQuota - processingUsed, 0);

  return {
    processingUnlimited,
    processingQuota,
    processingUsed,
    processingRemaining,
    processingAllowedByAccount: processingUnlimited || processingRemaining > 0
  };
}

function isCurrentOcrProviderEnabled() {
  if (OCR_PROVIDER === "google") {
    return GOOGLE_OCR_ENABLED;
  }

  if (OCR_PROVIDER === "yandex") {
    return YANDEX_OCR_ENABLED;
  }

  return false;
}

function isCurrentAiProviderEnabled() {
  if (AI_PROVIDER === "yandex") {
    return YANDEX_AI_ENABLED;
  }

  if (AI_PROVIDER === "openai") {
    return OPENAI_ENABLED;
  }

  return false;
}

export function getProcessingGuardError(user) {
  if (!PROCESSING_ENABLED) {
    return "PROCESSING_DISABLED";
  }

  if (PROCESSING_ALLOWLIST_EMAILS.length > 0) {
    const userEmail = user?.email?.toLowerCase();

    if (!userEmail || !PROCESSING_ALLOWLIST_EMAILS.includes(userEmail)) {
      return "PROCESSING_NOT_ALLOWED";
    }
  }

  if (!isCurrentOcrProviderEnabled()) {
    return `${OCR_PROVIDER.toUpperCase()}_OCR_DISABLED`;
  }

  if (!isCurrentAiProviderEnabled()) {
    return `${AI_PROVIDER.toUpperCase()}_AI_DISABLED`;
  }

  const access = getUserProcessingAccess(user);

  if (!access.processingAllowedByAccount) {
    return "PROCESSING_NOT_AVAILABLE_FOR_USER";
  }

  return null;
}
