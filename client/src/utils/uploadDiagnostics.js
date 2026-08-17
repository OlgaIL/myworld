import { trackGoal } from "../services/analytics";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function truncate(value, limit = 160) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, limit);
}

function normalizePlatformFamily() {
  const platform = String(navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  const userAgent = String(navigator.userAgent || "").toLowerCase();

  if (platform.includes("android") || userAgent.includes("android")) return "android";
  if (platform.includes("iphone") || platform.includes("ipad") || userAgent.includes("iphone") || userAgent.includes("ipad")) return "ios";
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  return "other";
}

function normalizeBrowserFamily() {
  const userAgent = String(navigator.userAgent || "").toLowerCase();

  if (userAgent.includes("yabrowser")) return "yandex";
  if (userAgent.includes("edg/")) return "edge";
  if (userAgent.includes("firefox")) return "firefox";
  if (userAgent.includes("chrome") || userAgent.includes("crios")) return "chrome";
  if (userAgent.includes("safari")) return "safari";
  return "other";
}

export function createUploadAttemptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = crypto.getRandomValues(new Uint32Array(4));
    return `${values[0].toString(16)}-${values[1].toString(16)}-${values[2].toString(16)}-${values[3].toString(16)}`;
  }

  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getSafeErrorDetails(error) {
  return {
    errorName: truncate(error?.name || "Error", 80),
    errorCode: truncate(error?.code || "", 80),
    errorMessage: truncate(error?.message || "", 160)
  };
}

export function getUploadClientContext() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  return {
    online: navigator.onLine !== false,
    visibilityState: document.visibilityState || "unknown",
    platformFamily: normalizePlatformFamily(),
    browserFamily: normalizeBrowserFamily(),
    viewportWidth: Math.max(0, Number(window.innerWidth) || 0),
    viewportHeight: Math.max(0, Number(window.innerHeight) || 0),
    connectionType: truncate(connection?.effectiveType || "unknown", 24)
  };
}

export function logUploadDiagnostic(event, details = {}) {
  console.info("[upload-diagnostic]", JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details
  }));
}

export function reportGuestUploadFailure(details = {}) {
  const payload = {
    event: "upload_failed",
    uploadAttemptId: truncate(details.uploadAttemptId, 80),
    stage: truncate(details.stage || "wait_response", 32),
    status: Number.isInteger(details.status) ? details.status : 0,
    durationMs: Math.max(0, Math.round(Number(details.durationMs) || 0)),
    hasResponse: Boolean(details.hasResponse),
    preparedSizeBytes: Math.max(0, Math.round(Number(details.preparedSizeBytes) || 0)),
    mimeType: truncate(details.mimeType, 80),
    ...getSafeErrorDetails(details.error),
    ...getUploadClientContext()
  };

  trackGoal("guest_upload_failed", {
    stage: payload.stage,
    status: payload.status,
    has_response: payload.hasResponse ? 1 : 0,
    online: payload.online ? 1 : 0,
    platform: payload.platformFamily,
    browser: payload.browserFamily,
    connection: payload.connectionType
  });

  logUploadDiagnostic("upload_failed", payload);

  fetch(`${API_URL}/api/client-diagnostics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: "omit"
  }).catch(() => {
    // Diagnostics must never affect uploading or surface an extra error.
  });
}
