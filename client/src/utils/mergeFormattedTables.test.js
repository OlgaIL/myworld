import assert from "node:assert/strict";
import test from "node:test";
import { mergeFormattedTables, promoteDocumentTitle } from "./mergeFormattedTables.js";

test("replaces two captioned table spans while preserving prose between them", () => {
  const formatted = { blocks: [
    { type: "paragraph", text: "Таблица 17 – Вводы мощностей" },
    { type: "paragraph", text: "Наименование Всего ТЭС СЭС" },
    { type: "paragraph", text: "2027 г. 216,8 0 216,8" },
    { type: "paragraph", text: "2028 г. 221,0 0 221,0" },
    { type: "paragraph", text: "Развитие возобновляемых источников энергии предусматривает строительство СЭС." },
    { type: "paragraph", text: "Таблица 18 – Установленная мощность" },
    { type: "paragraph", text: "Наименование Всего ТЭС СЭС" },
    { type: "paragraph", text: "2027 г. 2090,6 1593,8 496,8" },
    { type: "paragraph", text: "2028 г. 2311,6 1593,8 717,8" }
  ] };
  const extracted = { blocks: [
    { type: "heading", text: "Таблица 17 – Вводы мощностей" },
    { type: "table", headers: ["Наименование", "2027 г.", "2028 г."], rows: [["СЭС", "216,8", "221,0"], ["ТЭС", "0", "0"]] },
    { type: "heading", text: "Таблица 18 – Установленная мощность" },
    { type: "table", headers: ["Наименование", "2027 г.", "2028 г."], rows: [["СЭС", "496,8", "717,8"], ["ТЭС", "1593,8", "1593,8"]] }
  ] };
  const result = mergeFormattedTables(formatted, extracted);
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks.map((block) => block.type),
    ["heading", "table", "paragraph", "heading", "table"]);
  assert.match(result.content.blocks[2].text, /Развитие/);
  assert.equal(result.content.blocks[4].rows[0][2], "717,8");
});

test("replaces an uncaptioned pipe table but retains calculations below", () => {
  const formatted = { blocks: [
    { type: "paragraph", text: "Расчет размера платы" },
    { type: "paragraph", text: "Вид услуги | Норматив | Начислено" },
    { type: "paragraph", text: "Отопление | Гкал | 1704,04" },
    { type: "paragraph", text: "ХВС | м³ | 255,79" },
    { type: "paragraph", text: "Расход тепловой энергии на подогрев воды:" }
  ] };
  const extracted = { blocks: [
    { type: "heading", text: "Расчет размера платы" },
    { type: "table", headers: ["Вид услуги", "Норматив", "Начислено"], rows: [["Отопление", "Гкал", "1704,04"], ["ХВС", "м³", "255,79"]] }
  ] };
  const result = mergeFormattedTables(formatted, extracted);
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks.map((block) => block.type), ["heading", "table", "paragraph"]);
  assert.match(result.content.blocks[2].text, /Расход тепловой/);
});

test("leaves uncertain placement unchanged", () => {
  const formatted = { blocks: [{ type: "paragraph", text: "Свободный текст без таблиц" }] };
  const extracted = { blocks: [{ type: "table", headers: ["A", "B"], rows: [["x", "1"], ["y", "2"]] }] };
  assert.deepEqual(mergeFormattedTables(formatted, extracted), { content: formatted, merged: false });
});

test("merges a bill formatted with dashes and restores its document heading", () => {
  const title = "Расчет размера платы за горячую воду";
  const formatted = promoteDocumentTitle({ blocks: [
    { type: "paragraph", text: title },
    { type: "paragraph", text: "Вид услуги — Норматив — Ед. изм. — Начислено" },
    { type: "paragraph", text: "Отопление — Гкал — 0,018100 — 1704,04" },
    { type: "paragraph", text: "ХВС — м³ — 4,260000 — 255,79" },
    { type: "paragraph", text: "Итого — 3 969,25" },
    { type: "paragraph", text: "Расход тепловой энергии на подогрев воды:" }
  ] }, title);
  const extracted = { blocks: [
    { type: "heading", text: title },
    { type: "table", headers: ["Вид услуги", "Норматив", "Ед.изм.", "Начислено"],
      rows: [["Отопление", "Гкал", "0,018100", "1704,04"], ["ХВС", "м³", "4,260000", "255,79"], ["Итого", "", "", "3 969,25"]] }
  ] };
  const result = mergeFormattedTables(formatted, extracted);
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks.map((block) => block.type), ["heading", "table", "paragraph"]);
  assert.match(result.content.blocks[2].text, /Расход тепловой/);
});

test("merges table rows even when formatting removes all column separators", () => {
  const title = "Расчет размера платы за горячую воду";
  const formatted = promoteDocumentTitle({ blocks: [
    { type: "paragraph", text: title },
    { type: "paragraph", text: "Вид услуги Норматив Ед. изм. Объем потребления Начислено" },
    { type: "paragraph", text: "Отопление Гкал 0,018100 0,964644 1704,04" },
    { type: "paragraph", text: "ХВС м³ 4,260000 9,804000 255,79" },
    { type: "paragraph", text: "Итого 3969,25" },
    { type: "paragraph", text: "Расход тепловой энергии на подогрев воды:" }
  ] }, title);
  const extracted = { blocks: [
    { type: "heading", text: title },
    { type: "table", headers: ["Вид услуги", "Ед.изм.", "Норматив потребления", "Начислено"],
      rows: [["Отопление", "Гкал", "0,018100", "1704,04"],
        ["ХВС", "м³", "4,260000", "255,79"], ["Итого", "", "", "3 969,25"]] }
  ] };
  const result = mergeFormattedTables(formatted, extracted);
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks.map((block) => block.type), ["heading", "table", "paragraph"]);
  assert.match(result.content.blocks[2].text, /Расход тепловой/);

  const altered = structuredClone(formatted);
  altered.blocks[3].text = "ХВС м³ 1,23";
  assert.equal(mergeFormattedTables(altered, extracted).merged, false);
});

test("splits a title from the following paragraph without losing text", () => {
  const title = "Заявление об установлении факта принятия наследства";
  const content = { blocks: [{ type: "paragraph", text: `${title} в результате смерти наследодателя.` }] };
  assert.deepEqual(promoteDocumentTitle(content, title).blocks, [
    { type: "heading", text: title },
    { type: "paragraph", text: "в результате смерти наследодателя." }
  ]);
});

test("merges a bill represented by header and row lists, preserving calculations", () => {
  const title = "Расчет размера платы за горячую воду";
  const formatted = { blocks: [
    { type: "heading", text: title },
    { type: "list", ordered: true, items: ["Вид услуги", "Норматив", "Ед.изм.", "потребления", "Объем потребления", "Тариф, коммун. руб.", "Начислено"] },
    { type: "list", items: ["Отопление, Гкал, 0,018100, 0,964644", "ХВС, м³, 4,260000, 9,804000, 26,09, 255,79"] },
    { type: "paragraph", text: "Итого 3 969,25 руб." },
    { type: "paragraph", text: "Расход тепловой энергии: 11,569 * 0,661 = 0,764711 Гкал." },
    { type: "paragraph", text: "Стоимость подогрева: 0,764711 * 1766,5 = 1350,86 руб." }
  ] };
  const extracted = { blocks: [
    { type: "heading", text: title },
    { type: "table", headers: ["Вид услуги", "Ед.изм.", "Норматив потребления", "Объем потребления коммун. услуги", "Тариф, руб.", "Начислено"],
      rows: [["Отопление", "Гкал", "0,018100", "0,964644", "1 766,50", "1 704,04"],
        ["ХВС", "м3", "4,260000", "9,804000", "26,09", "255,79"], ["Итого", "", "", "", "", "3 969,25"]] }
  ] };
  const original = structuredClone(formatted);
  const result = mergeFormattedTables(formatted, extracted);
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks, [...extracted.blocks, ...formatted.blocks.slice(4)]);
  assert.deepEqual(formatted, original);

  const withExtraText = structuredClone(formatted);
  withExtraText.blocks[2].items.push("Комментарий, который нельзя потерять");
  assert.equal(mergeFormattedTables(withExtraText, extracted).merged, false);

  const wrongValue = structuredClone(formatted);
  wrongValue.blocks[2].items[1] = "ХВС, м³, 1,23";
  assert.equal(mergeFormattedTables(wrongValue, extracted).merged, false);

  const ambiguous = { blocks: [...formatted.blocks, ...formatted.blocks] };
  assert.equal(mergeFormattedTables(ambiguous, extracted).merged, false);
});
