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
    section: photo.section || "",
    topic: photo.topic || "",
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

export function getUserProductAccess(user, recordsUsed) {
  const freeAccess = getUserRecordAccess(recordsUsed);
  const unlimitedAccess = Boolean(user?.processingEnabled ?? user?.processing_enabled);
  const packageQuota = Number(user?.processingQuota ?? user?.processing_quota ?? 0);
  const packageUsed = Number(user?.processingUsed ?? user?.processing_used ?? 0);
  const packageRemaining = Math.max(packageQuota - packageUsed, 0);
  const accessExpiresAt = user?.accessExpiresAt ?? user?.access_expires_at ?? null;
  const expiresAtTime = accessExpiresAt ? new Date(accessExpiresAt).getTime() : 0;
  const extendedAccessActive = Boolean(expiresAtTime && expiresAtTime > Date.now());
  const recordUploadAllowed = unlimitedAccess || extendedAccessActive || freeAccess.recordUploadAllowed || packageRemaining > 0;

  return {
    ...freeAccess,
    packageQuota,
    packageUsed,
    packageRemaining,
    packageAccessActive: packageRemaining > 0,
    recordUploadAllowed,
    unlimitedAccess,
    accessExpiresAt,
    extendedAccessActive
  };
}

function isOcrProviderEnabled(provider = OCR_PROVIDER) {
  if (provider === "google") {
    return GOOGLE_OCR_ENABLED;
  }

  if (provider === "yandex") {
    return YANDEX_OCR_ENABLED;
  }

  if (provider === "openai") {
    return OPENAI_ENABLED;
  }

  return false;
}

function isAiProviderEnabled(provider = AI_PROVIDER) {
  if (provider === "yandex") {
    return YANDEX_AI_ENABLED;
  }

  if (provider === "openai") {
    return OPENAI_ENABLED;
  }

  return false;
}

export function getProcessingGuardError(user, providers = {}) {
  if (!PROCESSING_ENABLED) {
    return "PROCESSING_DISABLED";
  }

  if (PROCESSING_ALLOWLIST_EMAILS.length > 0) {
    const userEmail = user?.email?.toLowerCase();

    if (!userEmail || !PROCESSING_ALLOWLIST_EMAILS.includes(userEmail)) {
      return "PROCESSING_NOT_ALLOWED";
    }
  }

  const ocrProvider = providers.ocrProvider || OCR_PROVIDER;
  const aiProvider = providers.aiProvider || AI_PROVIDER;

  if (!isOcrProviderEnabled(ocrProvider)) {
    return `${ocrProvider.toUpperCase()}_OCR_DISABLED`;
  }

  if (!isAiProviderEnabled(aiProvider)) {
    return `${aiProvider.toUpperCase()}_AI_DISABLED`;
  }

  return null;
}

export function getProcessingServiceGuardError(providers = {}) {
  if (!PROCESSING_ENABLED) {
    return "PROCESSING_DISABLED";
  }

  const ocrProvider = providers.ocrProvider || OCR_PROVIDER;
  const aiProvider = providers.aiProvider || AI_PROVIDER;

  if (!isOcrProviderEnabled(ocrProvider)) {
    return `${ocrProvider.toUpperCase()}_OCR_DISABLED`;
  }

  if (!isAiProviderEnabled(aiProvider)) {
    return `${aiProvider.toUpperCase()}_AI_DISABLED`;
  }

  return null;
}
