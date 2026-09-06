import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_UNAVAILABLE_MESSAGE,
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

test("allows enrichment retry for recognized and legacy Yandex errors with OCR text", () => {
  const document = { status: "recognized", ocr_text: "Достаточно длинный распознанный текст" };
  assert.equal(canRetryStoredEnrichment(document), true);
  assert.equal(canRetryStoredEnrichment({ ...document, status: "error", error_message: "Yandex GPT failed" }), true);
  assert.equal(canRetryStoredEnrichment({ ...document, status: "error", error_message: "OCR failed" }), false);
  assert.equal(canRetryStoredEnrichment({ ...document, ocr_text: "коротко" }), false);
});
