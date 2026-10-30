import assert from "node:assert/strict";
import test from "node:test";
import { extractGoogleOcrResult } from "../services/ocrService.js";
import { normalizeOcrResult } from "../utils/ocr.js";

test("Google quota error is not mistaken for an image without text", () => {
  const result = normalizeOcrResult(extractGoogleOcrResult({
    error: { code: 8, message: "Resource has been exhausted" }
  }));
  assert.equal(result.text, "");
  assert.match(result.error, /лимит Google OCR/);
});

test("Google returns empty text only when no annotations or API error exist", () => {
  assert.equal(extractGoogleOcrResult({ textAnnotations: [] }), "");
});

test("Google recognized text keeps the existing string result", () => {
  assert.equal(extractGoogleOcrResult({
    textAnnotations: [{ description: "Пример распознанного текста" }]
  }), "Пример распознанного текста");
});
