import assert from "node:assert/strict";
import test from "node:test";
import { tablesToContent, validateTableLayout, validateTablePayload } from "../services/documentTableService.js";
import { isTableSuspected } from "../utils/tableDetection.js";

const table = {
  title: "Таблица 17 — Вводы, МВт",
  headers: ["Наименование", "2027 г.", "2028 г.", "2029 г."],
  rows: [
    ["Всего", "216,8", "221,0", "530,6"],
    ["ТЭС", "–", "–", "460,0"],
    ["СЭС", "216,8", "221,0", "70,6"]
  ]
};

function annotation(description, x, y) {
  return { description, boundingPoly: { vertices: [
    { x, y }, { x: x + 35, y }, { x: x + 35, y: y + 12 }, { x, y: y + 12 }
  ] } };
}

function tableAnnotations() {
  const words = [annotation("page", 0, 0)];
  for (let col = 1; col < table.headers.length; col++) {
    words.push(annotation(String(2026 + col), 30 + col * 110, 40));
  }
  for (let row = 0; row < table.rows.length; row++) {
    table.rows[row].forEach((cell, col) => {
      if (cell !== "–") words.push(annotation(cell, 30 + col * 110, 80 + row * 30));
    });
  }
  return words;
}

test("validates rows and columns against independent OCR coordinates", () => {
  assert.deepEqual(validateTableLayout([table], tableAnnotations()), { valid: true, reason: null });
  assert.equal(tablesToContent([table]).blocks[1].rows[0][3], "530,6");
});

test("rejects a transposed table even if all numbers are present", () => {
  const transposed = { title: table.title, headers: ["Наименование", "Всего", "ТЭС", "СЭС"],
    rows: [
      ["2027 г.", "216,8", "–", "216,8"],
      ["2028 г.", "221,0", "–", "221,0"],
      ["2029 г.", "530,6", "460,0", "70,6"]
    ] };
  assert.equal(validateTableLayout([transposed], tableAnnotations()).valid, false);
});

test("rejects invented or shifted values and ragged model output", () => {
  const shifted = structuredClone(table);
  shifted.rows[0][1] = "999,9";
  assert.equal(validateTableLayout([shifted], tableAnnotations()).valid, false);
  assert.throws(() => validateTablePayload({ tables: [{ ...table,
    rows: [["Всего", "216,8"]] }] }), /TABLE_INVALID_STRUCTURE/);
});

test("shows the table tab only for model signal or an actual printed caption", () => {
  assert.equal(isTableSuspected({ has_table: true }), true);
  assert.equal(isTableSuspected({ ocr_text: "Величина представлена в таблице 18." }), false);
  assert.equal(isTableSuspected({ ocr_text: "Таблица 18 – Установленная мощность\nВсего" }), true);
});
