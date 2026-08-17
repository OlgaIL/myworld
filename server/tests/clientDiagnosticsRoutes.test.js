import assert from "node:assert/strict";
import test from "node:test";
import { validateClientDiagnostic } from "../routes/clientDiagnosticsRoutes.js";

const validDiagnostic = {
  event: "upload_failed",
  uploadAttemptId: "9a880b31-0d3a-4ee0-bd64-b2ba7b30eb7c",
  stage: "wait_response",
  status: 0,
  durationMs: 1200,
  preparedSizeBytes: 900000,
  mimeType: "image/jpeg",
  errorName: "AxiosError",
  errorCode: "ERR_NETWORK",
  errorMessage: "Network Error",
  hasResponse: false,
  online: true,
  visibilityState: "visible",
  platformFamily: "android",
  browserFamily: "yandex",
  viewportWidth: 360,
  viewportHeight: 806,
  connectionType: "4g"
};

test("accepts a bounded upload failure diagnostic", () => {
  const diagnostic = validateClientDiagnostic(validDiagnostic);

  assert.equal(diagnostic?.event, "upload_failed");
  assert.equal(diagnostic?.uploadAttemptId, validDiagnostic.uploadAttemptId);
  assert.equal(diagnostic?.viewportWidth, 360);
});

test("rejects unknown events and malformed required fields", () => {
  assert.equal(validateClientDiagnostic({ ...validDiagnostic, event: "anything" }), null);
  assert.equal(validateClientDiagnostic({ ...validDiagnostic, uploadAttemptId: "" }), null);
  assert.equal(validateClientDiagnostic({ ...validDiagnostic, status: 700 }), null);
});

test("does not include arbitrary request fields in the validated result", () => {
  const diagnostic = validateClientDiagnostic({
    ...validDiagnostic,
    filename: "private-photo.jpg",
    cookie: "session=secret",
    url: "https://word2you.ru/?yclid=private",
    documentText: "private document"
  });

  assert.equal("filename" in diagnostic, false);
  assert.equal("cookie" in diagnostic, false);
  assert.equal("url" in diagnostic, false);
  assert.equal("documentText" in diagnostic, false);
});
