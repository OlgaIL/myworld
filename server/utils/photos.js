import {
  AI_PROVIDER,
  GOOGLE_OCR_ENABLED,
  OCR_PROVIDER,
  OPENAI_ENABLED,
  PROCESSING_ALLOWLIST_EMAILS,
  PROCESSING_ENABLED,
  USER_RECORD_LIMIT,
  YANDEX_AI_ENABLED,
  YANDEX_OCR_ENABLED
} from "../config/env.js";

export function mapPhotoInfo(photo) {
  return {
    id: photo.filename,
    filename: photo.filename,
    status: photo.status,
    text: photo.ocr_text || "",
    cleanText: photo.clean_text || "",
    title: photo.title || "",
    summary: photo.summary || "",
    category: photo.category || "",
    tags: Array.isArray(photo.tags) ? photo.tags : [],
    textQuality: photo.text_quality || "",
    notes: photo.ai_notes || "",
    error: photo.error_message || null,
    createdAt: photo.created_at
  };
}

export function getUserProcessingAccess(user) {
  const processingQuota = Number(user?.processingQuota ?? user?.processing_quota ?? 0);
  const processingUsed = Number(user?.processingUsed ?? user?.processing_used ?? 0);
  const processingUnlimited = Boolean(user?.processingEnabled ?? user?.processing_enabled);
  const processingRemaining = Math.max(processingQuota - processingUsed, 0);

  return {
    processingUnlimited,
    processingQuota,
    processingUsed,
    processingRemaining,
    processingAllowedByAccount: processingUnlimited || processingRemaining > 0
  };
}

export function getUserRecordAccess(recordsUsed) {
  const limit = USER_RECORD_LIMIT;
  const used = Number(recordsUsed || 0);
  const remaining = Math.max(limit - used, 0);

  return {
    recordLimit: limit,
    recordsUsed: used,
    recordsRemaining: remaining,
    recordUploadAllowed: remaining > 0
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

  return null;
}

export function getProcessingServiceGuardError() {
  if (!PROCESSING_ENABLED) {
    return "PROCESSING_DISABLED";
  }

  if (!isCurrentOcrProviderEnabled()) {
    return `${OCR_PROVIDER.toUpperCase()}_OCR_DISABLED`;
  }

  if (!isCurrentAiProviderEnabled()) {
    return `${AI_PROVIDER.toUpperCase()}_AI_DISABLED`;
  }

  return null;
}
