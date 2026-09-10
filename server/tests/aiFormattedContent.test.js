import assert from "node:assert/strict";
import test from "node:test";
import {
  formattedContentToText,
  normalizeFormattedContent,
  parseAIResponse
} from "../services/aiService.js";
import { YANDEX_CORRECTION_HINTS } from "../services/prompts/yandexPrompt.js";

test("normalizes supported formatted blocks and derives readable text", () => {
  const content = normalizeFormattedContent({
    blocks: [
      { type: "heading", text: " Заголовок " },
      { type: "paragraph", text: "Первый абзац" },
      { type: "list", items: [" Первый пункт ", "Второй пункт", ""] },
      { type: "table", rows: [["лишнее"]] }
    ]
  });

  assert.deepEqual(content, {
    blocks: [
      { type: "heading", text: "Заголовок" },
      { type: "paragraph", text: "Первый абзац" },
      { type: "list", items: ["Первый пункт", "Второй пункт"] }
    ]
  });
  assert.equal(
    formattedContentToText(content),
    "Заголовок\n\nПервый абзац\n\n- Первый пункт\n- Второй пункт"
  );
});

test("parses one AI response into plain and formatted variants", () => {
  const result = parseAIResponse(JSON.stringify({
    title: "Расходы",
    summary: "Таблица расходов с формулой.",
    category: "финансы",
    section: "финансы",
    topic: "расходы",
    tags: ["расходы"],
    formattedContent: {
      blocks: [
        { type: "heading", text: "Расходы" },
        { type: "list", items: ["Итого: 1000 рублей"] }
      ]
    },
    hasTable: true,
    hasFormulas: true,
    hasRecognitionErrors: true,
    textQuality: "full_text",
    notes: ""
  }));

  assert.equal(result.cleanText, "Расходы\n\n- Итого: 1000 рублей");
  assert.equal(result.hasTable, true);
  assert.equal(result.hasFormulas, true);
  assert.equal(result.hasRecognitionErrors, true);
  assert.equal(result.formattedContent.blocks.length, 2);
});

test("keeps compatibility with an older cleanText response", () => {
  const result = parseAIResponse(JSON.stringify({
    cleanText: "Первый абзац\n\nВторой абзац",
    textQuality: "full_text"
  }));

  assert.equal(result.cleanText, "Первый абзац\n\nВторой абзац");
  assert.equal(result.hasRecognitionErrors, false);
  assert.deepEqual(result.formattedContent, {
    blocks: [
      { type: "paragraph", text: "Первый абзац" },
      { type: "paragraph", text: "Второй абзац" }
    ]
  });
});

test("separates paragraph blocks and joins wrapped list item lines", () => {
  const content = normalizeFormattedContent({
    blocks: [
      { type: "paragraph", text: "Первый абзац\n\nВторой\nабзац" },
      { type: "list", items: ["Длинный пункт,\nкоторый перенесён на новую строку"] },
      { type: "heading", text: "  Общий\nзаголовок  " }
    ]
  });

  assert.deepEqual(content, {
    blocks: [
      { type: "paragraph", text: "Первый абзац" },
      { type: "paragraph", text: "Второй абзац" },
      { type: "list", items: ["Длинный пункт, который перенесён на новую строку"] },
      { type: "heading", text: "Общий заголовок" }
    ]
  });
});

test("converts sequential list markers into an ordered list", () => {
  const content = normalizeFormattedContent({
    blocks: [{ type: "list", items: ["1) Первый шаг", "2) Второй шаг", "3) Третий шаг"] }]
  });

  assert.deepEqual(content, {
    blocks: [{ type: "list", ordered: true, items: ["Первый шаг", "Второй шаг", "Третий шаг"] }]
  });
  assert.equal(formattedContentToText(content), "1. Первый шаг\n2. Второй шаг\n3. Третий шаг");
});

test("preserves the starting number of an ordered list", () => {
  const content = normalizeFormattedContent({
    blocks: [{ type: "list", items: ["5) Пятый шаг", "6) Шестой шаг"] }]
  });

  assert.deepEqual(content, {
    blocks: [{ type: "list", ordered: true, start: 5, items: ["Пятый шаг", "Шестой шаг"] }]
  });
  assert.equal(formattedContentToText(content), "5. Пятый шаг\n6. Шестой шаг");
});

test("stores verified replacements separately and keeps recognition note generic", () => {
  const result = parseAIResponse(JSON.stringify({
    formattedContent: {
      blocks: [{ type: "paragraph", text: "ЗФ и Евгения" }]
    },
    corrections: [
      { original: "Dupen ropy", replacement: "ЗФ" },
      { original: "e", replacement: "Евгения" },
      { original: "не найдено", replacement: "такого текста нет" }
    ],
    hasRecognitionErrors: false,
    textQuality: "full_text",
    notes: "Исправлены конкретные фрагменты."
  }), { sourceText: "Dupen ropy и e" });

  assert.equal(result.hasRecognitionErrors, true);
  assert.equal(result.notes, "В исходном тексте присутствуют ошибки распознавания и опечатки.");
  assert.deepEqual(result.corrections.map(({ original, replacement, applied }) => ({
    original,
    replacement,
    applied
  })), [
    { original: "Dupen ropy", replacement: "ЗФ", applied: true },
    { original: "e", replacement: "Евгения", applied: true }
  ]);
});

test("adds a verified Yandex correction hint when the model omits it", () => {
  const result = parseAIResponse(JSON.stringify({
    formattedContent: {
      blocks: [{ type: "paragraph", text: "Ильина Евгения" }]
    },
    corrections: [],
    hasRecognitionErrors: true,
    textQuality: "full_text",
    notes: ""
  }), {
    sourceText: "Ильина Евишня",
    correctionHints: YANDEX_CORRECTION_HINTS
  });

  assert.deepEqual(result.corrections.map(({ original, replacement }) => ({
    original,
    replacement
  })), [{ original: "Евишня", replacement: "Евгения" }]);
});
