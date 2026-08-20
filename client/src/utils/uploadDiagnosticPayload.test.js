import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGuestUploadFailureMetricParams,
  buildGuestUploadFailurePayload
} from "./uploadDiagnosticPayload.js";

const context = {
  online: true,
  visibilityState: "visible",
  platformFamily: "android",
  browserFamily: "yandex",
  viewportWidth: 384,
  viewportHeight: 851,
  connectionType: "4g"
};

test("builds a complete safe guest upload failure payload", () => {
  const payload = buildGuestUploadFailurePayload({
    uploadAttemptId: "attempt-12345678",
    stage: "wait_response",
    status: 0,
    durationMs: 37_000,
    hasResponse: false,
    preparedSizeBytes: 442_000,
    mimeType: "image/jpeg",
    error: Object.assign(new Error("Network Error https://private.example/file.jpg"), {
      name: "AxiosError",
      code: "ERR_NETWORK"
    })
  }, context);

  assert.equal(payload.uploadAttemptId, "attempt-12345678");
  assert.equal(payload.errorName, "AxiosError");
  assert.equal(payload.errorCode, "ERR_NETWORK");
  assert.equal(payload.errorMessage, "Network Error [url]");
  assert.equal(payload.preparedSizeBytes, 442_000);
  assert.equal(payload.browserFamily, "yandex");
  assert.equal("filename" in payload, false);
  assert.equal("documentText" in payload, false);
});

test("maps every diagnostic field to technical Metrika parameters", () => {
  const params = buildGuestUploadFailureMetricParams({
    uploadAttemptId: "attempt-12345678",
    stage: "upload_body",
    errorName: "AxiosError",
    errorCode: "ERR_NETWORK",
    errorMessage: "Network Error",
    status: 0,
    hasResponse: false,
    durationMs: 37_000,
    preparedSizeBytes: 442_000,
    mimeType: "image/jpeg",
    ...context
  });

  assert.deepEqual(params, {
    upload_attempt_id: "attempt-12345678",
    stage: "upload_body",
    error_name: "AxiosError",
    error_code: "ERR_NETWORK",
    error_message: "Network Error",
    status: 0,
    has_response: 0,
    duration_ms: 37_000,
    prepared_size_bytes: 442_000,
    mime_type: "image/jpeg",
    online: 1,
    visibility_state: "visible",
    platform: "android",
    browser: "yandex",
    viewport_width: 384,
    viewport_height: 851,
    connection_type: "4g"
  });
});
