import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualFormattedContent,
  capitalizeFormattedLine,
  formatFormattedLine,
  normalizeFormattedTypography
} from "../src/utils/formattedText.js";

test("capitalizes the first letter after leading punctuation or numbers", () => {
  assert.equal(capitalizeFormattedLine("новый абзац"), "Новый абзац");
  assert.equal(capitalizeFormattedLine("  «новый абзац»"), "  «Новый абзац»");
  assert.equal(capitalizeFormattedLine("1. новый пункт"), "1. Новый пункт");
});

test("keeps already capitalized text and text without letters unchanged", () => {
  assert.equal(capitalizeFormattedLine("Готовый текст"), "Готовый текст");
  assert.equal(capitalizeFormattedLine("123 + 456"), "123 + 456");
  assert.equal(capitalizeFormattedLine(""), "");
});

test("normalizes whitespace and accidental line breaks inside one block", () => {
  assert.equal(
    normalizeFormattedTypography("  первая строка  \n вторая\tстрока "),
    "первая строка вторая строка"
  );
  assert.equal(normalizeFormattedTypography("один\n\nдва"), "один два");
});

test("removes only unnecessary spaces around punctuation and brackets", () => {
  assert.equal(
    normalizeFormattedTypography("Текст , пример : ( значение ) и « слово » ."),
    "Текст, пример: (значение) и «слово»."
  );
  assert.equal(normalizeFormattedTypography("Цена 100 %"), "Цена 100%");
});

test("restores separator spaces without changing dots used for missing letters", () => {
  assert.equal(
    normalizeFormattedTypography("слово: б..рёза,.сина,м..лина"),
    "слово: б..рёза, .сина, м..лина"
  );
  assert.equal(normalizeFormattedTypography("Первое...Второе"), "Первое... Второе");
  assert.equal(normalizeFormattedTypography("б...рёза"), "б...рёза");
  assert.equal(normalizeFormattedTypography("1,5 кг;2,5 кг"), "1,5 кг; 2,5 кг");
});

test("formats a block consistently for display and copying", () => {
  assert.equal(formatFormattedLine("  «новый\nабзац» "), "«Новый абзац»");
});

test("preserves deliberate lines and headings in manually improved text", () => {
  assert.deepEqual(
    buildManualFormattedContent("Заявление\nоб установлении факта\n\n- Первый пункт\n- Второй пункт"),
    {
      blocks: [
        { type: "heading", text: "Заявление" },
        { type: "paragraph", text: "об установлении факта" },
        { type: "list", items: ["Первый пункт", "Второй пункт"] }
      ]
    }
  );
});

test("keeps short form fields as paragraphs instead of headings", () => {
  assert.deepEqual(
    buildManualFormattedContent("Госпошлина: рублей\nЗаявление\nОсновной текст"),
    {
      blocks: [
        { type: "paragraph", text: "Госпошлина: рублей" },
        { type: "heading", text: "Заявление" },
        { type: "paragraph", text: "Основной текст" }
      ]
    }
  );
});
