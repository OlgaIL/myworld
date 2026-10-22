import assert from "node:assert/strict";
import test from "node:test";
import { hasChangedMixedListMarkers, validateTimewebJson } from "../services/timewebAiService.js";
import { parseAIResponse } from "../services/aiService.js";
import { AI_CATEGORIES, AI_SECTIONS } from "../services/aiPrompt.js";

const source = "План\n1 Нужно выбрать товар\n2 Регистрация компании\n3. Оформление карточки\n• Для продаж нужны фото\nи видео\n• Для поиска нужно описание\nи его продолжение";
const blocks = [
  { type: "list", ordered: true, items: ["Нужно выбрать товар", "Регистрация компании", "Оформление карточки"] },
  { type: "list", items: ["Для продаж нужны фото и видео", "Для поиска нужно описание и его продолжение"] }
];
const document = (items) => JSON.stringify({
  title: "План", summary: "План действий", topic: "Товар", tags: [],
  category: AI_CATEGORIES[0], section: AI_SECTIONS[0], textQuality: "full_text",
  hasTable: false, hasFormulas: false, hasRecognitionErrors: false, notes: "", corrections: [],
  formattedContent: { blocks: items }
});

test("three numbered items and two bullets survive validation and common parsing without extra items", () => {
  const parsed = parseAIResponse(JSON.stringify(validateTimewebJson(document(blocks))), { sourceText: source });
  assert.equal(hasChangedMixedListMarkers(source, parsed.formattedContent), false);
  assert.equal(parsed.cleanText, "1. Нужно выбрать товар\n2. Регистрация компании\n3. Оформление карточки\n\n- Для продаж нужны фото и видео\n- Для поиска нужно описание и его продолжение");
});

test("flags the observed flattening and extra split continuation without changing any words", () => {
  const items = [...blocks[0].items, blocks[1].items[0], "Для поиска нужно описание", "и его продолжение"];
  const content = { blocks: [{ type: "list", ordered: true, items }] };
  assert.equal(hasChangedMixedListMarkers(source, content), true);
  assert.deepEqual(content.blocks[0].items, items);
  assert.equal(hasChangedMixedListMarkers("Обычный текст без списка", content), false);
});

test("accepts bounded nested list levels and preserves correction targets inside sublists", () => {
  const raw = JSON.parse(document([blocks[0], { ...blocks[1], level: 1 }]));
  raw.corrections = [{ original: "фото", replacement: "фотографии" }];
  raw.formattedContent.blocks[1].items[0] = "Для продаж нужны фотографии и видео";
  const parsed = parseAIResponse(JSON.stringify(validateTimewebJson(JSON.stringify(raw))), { sourceText: source });
  assert.equal(parsed.formattedContent.blocks[1].level, 1);
  assert.equal(parsed.corrections[0].blockIndex, 1);
  assert.equal(parsed.corrections[0].itemIndex, 0);
  assert.match(parsed.cleanText, /\n  - Для продаж нужны фотографии и видео/u);
});

test("rejects orphan, skipped, invalid and excessive nesting rather than losing hierarchy", () => {
  for (const items of [
    [{ ...blocks[1], level: 1 }],
    [blocks[0], { ...blocks[1], level: 2 }],
    [blocks[0], { type: "paragraph", text: "Другой раздел" }, { ...blocks[1], level: 1 }],
    [blocks[0], { ...blocks[1], level: 3 }],
    [blocks[0], { ...blocks[1], level: -1 }],
    [blocks[0], { ...blocks[1], level: "1" }],
    [blocks[0], { ...blocks[1], level: null }],
    [blocks[0], { ...blocks[1], ordered: "true" }],
    [blocks[0], { ...blocks[1], start: 0 }],
    [blocks[0], { type: "list", level: 1, text: "Неоднозначные подпункты" }],
    [blocks[0], { type: "list", level: null, text: "Недопустимый уровень" }]
  ]) assert.throws(() => validateTimewebJson(document(items)));
});
