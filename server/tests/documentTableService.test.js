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

test("preserves empty leading supplier codes while checking the remaining columns", () => {
  const sparse = { title: "Поставщики", headers: ["Код", "Поставщик", "Сумма"],
    rows: [["", "Альфа", "283,54"], ["", "Бета", "50,00"]] };
  const annotations = [annotation("page", 0, 0), annotation("Код", 30, 40),
    annotation("Поставщик", 140, 40), annotation("Сумма", 250, 40),
    annotation("Альфа", 140, 80), annotation("283,54", 250, 80),
    annotation("Бета", 140, 110), annotation("50,00", 250, 110)];
  assert.deepEqual(validateTablePayload({ tables: [sparse] }), [sparse]);
  assert.equal(validateTableLayout([sparse], annotations).valid, true);
  const shifted = structuredClone(sparse);
  shifted.rows[1] = ["", "50,00", "Бета"];
  assert.equal(validateTableLayout([shifted], annotations).valid, false);
  assert.throws(() => validateTablePayload({ tables: [{ ...sparse, rows: [["", "", ""], sparse.rows[1]] }] }), /TABLE_INVALID_STRUCTURE/);
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

test("accepts a visually identical Latin OCR label only when row values and coordinates match", () => {
  const bill = { title: "", headers: ["Вид услуги", "2027 г."],
    rows: [["ХВС", "255,79"], ["Итого", "3969,25"]] };
  const annotations = [annotation("page", 0, 0),
    annotation("Вид", 30, 40), annotation("2027", 140, 40),
    annotation("XBC", 30, 80), annotation("255,79", 140, 80),
    annotation("Итого", 30, 110), annotation("3969,25", 140, 110)];
  assert.equal(validateTableLayout([bill], annotations).valid, true);
  const wrong = structuredClone(bill);
  wrong.rows[0][1] = "255,78";
  assert.equal(validateTableLayout([wrong], annotations).valid, false);
});

test("detects printed captions and tabular OCR without opening numeric prose", () => {
  assert.equal(isTableSuspected({ has_table: true }), true);
  assert.equal(isTableSuspected({ ocr_text: "Величина представлена в таблице 18." }), false);
  assert.equal(isTableSuspected({ ocr_text: "Таблица 18 – Установленная мощность\nВсего" }), true);
  assert.equal(isTableSuspected({ ocr_text: `Расчет размера платы за горячую воду
Вид услуги
Ед.изм.
Норматив потребления
Объем потребления
Тариф, руб.
Начислено
Отопление
Гкал
0,018100
0,964644
1 766,50
1 704,04
ГВС: тепловая энергия
Гкал
0,066100
0,764711
1 766,50
1 350,86
Холодная вода для ГВС
м3
3,300000
11,569000
26,09
301,84
Итого
3 969,25` }), true);
  assert.equal(isTableSuspected({ ocr_text: `Счёт за горячую воду
Тариф пересмотрен в мае.
Начислено за период 1500 рублей.
Итого к оплате 1500 рублей.
Для расчёта использовали показания 11,569 и 0,764711.` }), false);
});
