import assert from "node:assert/strict";
import test from "node:test";
import { mergeFormattedTables, promoteDocumentTitle } from "./mergeFormattedTables.js";

test("new OCR placement works after formatter failure and preserves current corrected prose",()=>{
  const table={type:"table",tableId:"table-1",headers:["A","B"],rows:[["x","1"],["y","2"]]};
  const content={blocks:[table],documentContent:{blocks:[{type:"paragraph",text:"До таблицы"},table,{type:"paragraph",text:"Заявление Евишни"}]}};
  const empty=mergeFormattedTables(null,content);
  assert.equal(empty.merged,true);assert.equal(empty.content.blocks.at(-1).text,"Заявление Евишни");
  const current={blocks:[{type:"heading",text:"До таблицы"},{type:"paragraph",text:"Заявление Евгении"}]};
  const merged=mergeFormattedTables(current,content,{corrections:[{original:"Евишни",replacement:"Евгении",applied:true}]});
  assert.equal(merged.content.blocks[0].type,"heading");
  assert.equal(merged.content.blocks.at(-1).text,"Заявление Евгении");
  assert.equal(merged.content.blocks.filter(b=>b.type==="table").length,1);
  const manual={blocks:[{...table,rows:[["manually edited","100"]]}]};
  assert.deepEqual(mergeFormattedTables(manual,content).content,manual);
});

function proseFixture(){
  const table={type:'table',tableId:'table-1',headers:['Name','Value'],rows:[['Alpha','100']]};
  const opening='Уважаемые жильцы!';
  const intro='Сообщаем всем собственникам нашего дома о новом порядке оплаты услуг за текущий период начиная с первого числа следующего месяца.';
  const sourceMiddle='Начисления будут производится ежемесячно. Размер платы за дополнительную услугу составляет 150,00 рублей согласно решению общего собрания.';
  const correctedMiddle=sourceMiddle.replace('производится','производиться');
  const list={type:'list',items:['через банковское приложение после проверки реквизитов получателя платежа','в кассе организации в рабочие дни без дополнительной комиссии']};
  const tail=[{type:'paragraph',text:opening},{type:'paragraph',text:intro},{type:'paragraph',text:correctedMiddle},
    {type:'paragraph',text:'Оплатить услуги можно следующими способами:'},list];
  const source={type:'paragraph',text:[opening,intro,sourceMiddle,tail[3].text,...list.items].join('\n')};
  return {table,tail,source,existing:{blocks:[{type:'paragraph',text:'Old flattened table Alpha 100'},...tail]},
    extracted:{blocks:[table],placement:'ocr',documentContent:{blocks:[table,source]}}};
}

test('OCR placement preserves paragraphs, lists and spelling fixes after tables using unique exact boundaries',()=>{
  const {existing,extracted,table,tail}=proseFixture(),before=structuredClone(existing);
  const result=mergeFormattedTables(existing,extracted);
  assert.equal(result.merged,true);
  assert.deepEqual(result.content.blocks,[table,...tail]);
  assert.deepEqual(existing,before);
});

test('manual additions after the last source paragraph survive both exact and anchored placement',()=>{
  const {existing,extracted,table,tail}=proseFixture();
  const manual={type:'paragraph',text:'Моя дополнительная заметка после документа.'};
  existing.blocks.push(manual);
  assert.deepEqual(mergeFormattedTables(existing,extracted).content.blocks,[table,...tail,manual]);
  extracted.documentContent.blocks[1].text=tail.map(b=>b.type==='list'?b.items.join('\n'):b.text).join('\n');
  assert.deepEqual(mergeFormattedTables(existing,extracted).content.blocks,[table,...tail,manual]);
});

test('ambiguous anchors or unexplained numeric changes never authorize prose replacement',()=>{
  const first=proseFixture();
  first.existing.blocks.push(...structuredClone(first.tail));
  assert.deepEqual(mergeFormattedTables(first.existing,first.extracted).content.blocks,[first.table,first.source]);
  const second=proseFixture();
  second.existing.blocks[3]={...second.existing.blocks[3],text:second.existing.blocks[3].text.replace('150,00','250,00')};
  assert.deepEqual(mergeFormattedTables(second.existing,second.extracted).content.blocks,[second.table,second.source]);
  const tracked=mergeFormattedTables(second.existing,second.extracted,{corrections:[{original:'150,00',replacement:'250,00',applied:true}]});
  assert.deepEqual(tracked.content.blocks,[second.table,...second.existing.blocks.slice(1)]);
});

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

test("new documents insert tables by ID regardless of captions, wording or extraction order", () => {
  const source = (id) => ({ type: "table_source", tableId: `table-${id}`, text: "Сырые ячейки\n111\n222" });
  const text = { type: "paragraph", text: "Расчёт между таблицами: 111 + 222 = 333" };
  const formatted = { blocks: [source(1), text, source(2)] };
  const table = (id) => ({ type: "table", tableId: `table-${id}`, headers: ["A", "B"], rows: [["x", "111"], ["y", "222"]] });
  const result = mergeFormattedTables(formatted, { blocks: [table(2), table(1)] });
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks, [table(1), text, table(2)]);
  const caption = { type: "heading", text: "Таблица 17 — Мощность" };
  const captioned = { blocks: [caption, source(1), text] };
  assert.deepEqual(mergeFormattedTables(captioned, { blocks: [caption, table(1)] }).content.blocks,
    [caption, table(1), text]);
  for (const blocks of [[table(1)], [table(1), table(1)], [table(1), table(3)]]) {
    assert.deepEqual(mergeFormattedTables(formatted, { blocks }), { content: formatted, merged: false });
  }
});

test("merges two numbered tables split into column lists without removing intervening prose", () => {
  const heading = (number) => ({ type: "heading", text: `Таблица ${number} – Мощность электростанций` });
  const header = { type: "list", items: ["Наименование", "Всего", "ТЭС", "2027 г.", "2028 г."] };
  const prose = { type: "paragraph", text: "Рост мощности к 2028 году составит 221,0 МВт." };
  const table = { type: "table", headers: ["Наименование", "2027 г.", "2028 г."],
    rows: [["Всего", "216,8", "221,0"], ["ТЭС", "0", "0"]] };
  const formatted = { blocks: [heading(17), header,
    { type: "list", items: ["216,8", "221,0", "", "0", "0"] }, prose,
    heading(18), header, { type: "list", items: ["216,8", "221,0"] },
    { type: "list", items: ["0", "0"] }] };
  const extracted = { blocks: [heading(17), table, heading(18), table] };
  const result = mergeFormattedTables(formatted, extracted);
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks, [heading(17), table, prose, heading(18), table]);
  for (const extra of ["Комментарий нельзя удалять", "999,9", "216,8"]) {
    const invalid = structuredClone(formatted);
    invalid.blocks[2].items.push(extra);
    assert.deepEqual(mergeFormattedTables(invalid, extracted), { content: invalid, merged: false });
  }
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
