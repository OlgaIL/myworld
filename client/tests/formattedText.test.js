import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualFormattedContent,
  capitalizeFormattedLine,
  formatFormattedLine,
  getFormattedList,
  normalizeFormattedTypography
} from "../src/utils/formattedText.js";

test("capitalizes a leading letter but not a measurement unit after a number", () => {
  assert.equal(capitalizeFormattedLine("новый абзац"), "Новый абзац");
  assert.equal(capitalizeFormattedLine("  «новый абзац»"), "  «Новый абзац»");
  assert.equal(capitalizeFormattedLine("700 г"), "700 г");
  assert.equal(capitalizeFormattedLine("1. новый пункт"), "1. новый пункт");
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

test("turns manually entered pipe tables into structured tables without changing year values", () => {
  const content = buildManualFormattedContent(`Таблица 17 – Вводы мощностей, МВт
| Наименование | 2026 г. | 2027 г. | 2028 г. | Всего |
| --- | --- | --- | --- | --- |
| Всего | – | 216,8 | 221,0 | 437,8 |
| ТЭС | – | – | – | – |

Пояснение после таблицы.`);
  assert.deepEqual(content.blocks, [
    { type: "paragraph", text: "Таблица 17 – Вводы мощностей, МВт" },
    { type: "table", headers: ["Наименование", "2026 г.", "2027 г.", "2028 г.", "Всего"], rows: [
      ["Всего", "–", "216,8", "221,0", "437,8"],
      ["ТЭС", "–", "–", "–", "–"]
    ] },
    { type: "paragraph", text: "Пояснение после таблицы." }
  ]);
});

test("leaves incomplete pipe text as ordinary text", () => {
  const content = buildManualFormattedContent("| Слева | Справа |\n| --- | --- |\n| Только одна ячейка |");
  assert.equal(content.blocks.every((block) => block.type === "paragraph"), true);
});

test("accepts a readable pipe table without a markdown separator", () => {
  const content = buildManualFormattedContent("| Год | Всего | ТЭС | СЭС |\n| 2027 | 216,8 | – | 216,8 |\n| 2028 | 221,0 | – | 221,0 |");
  assert.deepEqual(content.blocks, [{
    type: "table",
    headers: ["Год", "Всего", "ТЭС", "СЭС"],
    rows: [["2027", "216,8", "–", "216,8"], ["2028", "221,0", "–", "221,0"]]
  }]);
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

test("builds an ordered list without duplicated numeric markers", () => {
  assert.deepEqual(
    buildManualFormattedContent("1) Первый шаг\n2) Второй шаг\n3) Третий шаг"),
    {
      blocks: [{
        type: "list",
        items: ["Первый шаг", "Второй шаг", "Третий шаг"],
        ordered: true
      }]
    }
  );
});

test("removes bare numeric markers from an explicitly ordered block", () => {
  assert.deepEqual(
    getFormattedList({
      type: "list",
      ordered: true,
      items: ["1 Первый шаг", "2 Второй шаг"]
    }),
    {
      ordered: true,
      start: 1,
      items: ["Первый шаг", "Второй шаг"]
    }
  );
});

test("preserves quantities inside an explicitly ordered list", () => {
  assert.deepEqual(
    getFormattedList({
      type: "list",
      ordered: true,
      items: [
        "Грудки куриного филе отварить, порезать",
        "2 средние луковицы пассеровать",
        "2 морковки пожарить",
        "700 г шампиньонов (очистить)",
        "3 яйца"
      ]
    }),
    {
      ordered: true,
      start: 1,
      items: [
        "Грудки куриного филе отварить, порезать",
        "2 средние луковицы пассеровать",
        "2 морковки пожарить",
        "700 г шампиньонов (очистить)",
        "3 яйца"
      ]
    }
  );
});
