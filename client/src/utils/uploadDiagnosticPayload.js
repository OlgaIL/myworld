function truncate(value, limit = 160) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[path]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, limit);
}

export function getSafeErrorDetails(error) {
  return {
    errorName: truncate(error?.name || "Error", 80),
    errorCode: truncate(error?.code || "", 80),
    errorMessage: truncate(error?.message || "", 160)
  };
}

export function buildGuestUploadFailurePayload(details = {}, clientContext = {}) {
  return {
    event: "upload_failed",
    uploadAttemptId: truncate(details.uploadAttemptId, 80),
    stage: truncate(details.stage || "wait_response", 32),
    status: Number.isInteger(details.status) ? details.status : 0,
    durationMs: Math.max(0, Math.round(Number(details.durationMs) || 0)),
    hasResponse: Boolean(details.hasResponse),
    preparedSizeBytes: Math.max(0, Math.round(Number(details.preparedSizeBytes) || 0)),
    mimeType: truncate(details.mimeType, 80),
    ...getSafeErrorDetails(details.error),
    ...clientContext
  };
}

export function buildGuestUploadFailureMetricParams(payload) {
  return {
    upload_attempt_id: payload.uploadAttemptId,
    stage: payload.stage,
    error_name: payload.errorName,
    error_code: payload.errorCode,
    error_message: payload.errorMessage,
    status: payload.status,
    has_response: payload.hasResponse ? 1 : 0,
    duration_ms: payload.durationMs,
    prepared_size_bytes: payload.preparedSizeBytes,
    mime_type: payload.mimeType,
    online: payload.online ? 1 : 0,
    visibility_state: payload.visibilityState,
    platform: payload.platformFamily,
    browser: payload.browserFamily,
    viewport_width: payload.viewportWidth,
    viewport_height: payload.viewportHeight,
    connection_type: payload.connectionType
  };
}
