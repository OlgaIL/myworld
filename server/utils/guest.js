import { GUEST_DOCUMENT_LIMIT, GUEST_DOCUMENT_TTL_HOURS } from "../config/env.js";

export const GUEST_SESSION_COOKIE_NAME = "guest_session_token";

export function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return acc;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function mapGuestDocumentInfo(document) {
  return {
    id: String(document.id),
    filename: document.filename,
    status: document.status,
    text: document.ocr_text || "",
    error: document.error_message || null,
    createdAt: document.created_at,
    expiresAt: document.expires_at
  };
}

export function isGuestDocumentExpired(document, now = new Date()) {
  if (!document?.expires_at) {
    return true;
  }

  return new Date(document.expires_at).getTime() <= now.getTime();
}

export function getGuestDocumentAccess(session) {
  const documentsUsed = Number(session?.documents_used || 0);
  const documentsRemaining = Math.max(GUEST_DOCUMENT_LIMIT - documentsUsed, 0);

  return {
    documentLimit: GUEST_DOCUMENT_LIMIT,
    documentsUsed,
    documentsRemaining,
    uploadAllowed: documentsRemaining > 0
  };
}

export function getGuestUploadGuardError(session) {
  const access = getGuestDocumentAccess(session);

  if (!access.uploadAllowed) {
    return "GUEST_LIMIT_REACHED";
  }

  return null;
}

export function getGuestDocumentExpiryDate(fromDate = new Date()) {
  const expiresAt = new Date(fromDate);
  expiresAt.setHours(expiresAt.getHours() + GUEST_DOCUMENT_TTL_HOURS);
  return expiresAt;
}
