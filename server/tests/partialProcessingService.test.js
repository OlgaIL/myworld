import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_UNAVAILABLE_MESSAGE,
  AI_CONNECTION_UNAVAILABLE_MESSAGE,
  buildRecognizedResult,
  canRetryStoredEnrichment
} from "../services/partialProcessingService.js";

test("keeps OCR text in the recognized state without formatted metadata", () => {
  const result = buildRecognizedResult("Распознанный исходный текст");
  assert.equal(result.status, "recognized");
  assert.equal(result.ocrText, "Распознанный исходный текст");
  assert.equal(result.cleanText, "Распознанный исходный текст");
  assert.equal(result.aiNotes, AI_UNAVAILABLE_MESSAGE);
  assert.deepEqual(result.formattedContent, { blocks: [] });
});

test("connection failures retain OCR and the saved cause, while refusals keep the general message", () => {
  for (const code of ["TIMEWEB_NETWORK_ERROR", "TIMEWEB_TIMEOUT", "TIMEWEB_REQUEST_ERROR",
    "TIMEWEB_AUTH_ERROR", "TIMEWEB_LIMIT_ERROR", "TIMEWEB_SERVICE_ERROR", "TIMEWEB_INVALID_JSON",
    "TIMEWEB_RESPONSE_TRUNCATED", "Yandex GPT failed"]) {
    const error = code.startsWith("TIMEWEB_") ? `Timeweb: ${code}` : code;
    const result = buildRecognizedResult("Исходный распознанный текст", error);
    const connection = ["TIMEWEB_NETWORK_ERROR", "TIMEWEB_TIMEOUT"].includes(code);
    assert.equal(result.aiNotes, connection ? AI_CONNECTION_UNAVAILABLE_MESSAGE : AI_UNAVAILABLE_MESSAGE, code);
    assert.equal(result.errorMessage, error);
    assert.equal(result.status, "recognized");
    assert.equal(result.cleanText, "Исходный распознанный текст");
    assert.deepEqual(result.formattedContent, { blocks: [] });
  }
});

test("allows enrichment retry for recognized and legacy Yandex errors with OCR text", () => {
  const document = { status: "recognized", ocr_text: "Достаточно длинный распознанный текст" };
  assert.equal(canRetryStoredEnrichment(document), true);
  assert.equal(canRetryStoredEnrichment({ ...document, status: "error", error_message: "Yandex GPT failed" }), true);
  assert.equal(canRetryStoredEnrichment({ ...document, status: "error", error_message: "OCR failed" }), false);
  assert.equal(canRetryStoredEnrichment({ ...document, ocr_text: "коротко" }), false);
});
