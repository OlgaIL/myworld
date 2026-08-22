import assert from "node:assert/strict";
import test from "node:test";
import { formatAiNotesForDisplay } from "../utils/aiNotes.js";

test("clarifies that quality notes refer to the source text", () => {
  assert.equal(
    formatAiNotesForDisplay("В тексте есть неразборчивые места и опечатки."),
    "В исходном тексте есть неразборчивые места и опечатки."
  );
  assert.equal(
    formatAiNotesForDisplay("Текст содержит неразборчивые фрагменты и возможные ошибки OCR."),
    "Исходный текст содержит неразборчивые фрагменты и возможные ошибки распознавания."
  );
});

test("keeps unrelated service notes unchanged", () => {
  assert.equal(
    formatAiNotesForDisplay("Текст распознан, но краткое описание временно недоступно."),
    "Текст распознан, но краткое описание временно недоступно."
  );
});
