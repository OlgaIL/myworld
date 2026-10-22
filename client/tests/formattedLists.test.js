import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormattedList } from "../src/components/FormattedList.js";
import { buildManualFormattedContent, getFormattedList, nestFormattedLists } from "../src/utils/formattedText.js";
import { getFormattedHtml, getFormattedText } from "../src/utils/formattedClipboard.js";

const content = { blocks: [
  { type: "list", ordered: true, items: ["Шаг один", "Шаг два", "Шаг три"] },
  { type: "list", level: 1, items: ["Первая деталь", "Вторая деталь и продолжение"] },
  { type: "list", level: 2, ordered: true, start: 2, items: ["Глубже"] },
  { type: "list", ordered: true, start: 4, items: ["Шаг четыре"] }
] };

test("actual React renderer nests sublists inside the last parent item and resumes numbering", () => {
  const tree = nestFormattedLists(content.blocks);
  const html = tree.map((block) => renderToStaticMarkup(createElement(FormattedList, { block }))).join("");
  assert.match(html, /<li>Шаг три<ul><li>Первая деталь<\/li><li>Вторая деталь и продолжение<ol start="2"><li>Глубже<\/li><\/ol><\/li><\/ul><\/li><\/ol><ol start="4">/);
  assert.equal((html.match(/<li>/gu) || []).length, 7);
  assert.equal(content.blocks[0].nestedLists, undefined, "tree building must not mutate stored content");
});

test("Word HTML and plain clipboard retain all levels and the resumed number", () => {
  const html = getFormattedHtml(content);
  assert.match(html, /<li>Шаг три<ul><li>Первая деталь<\/li><li>Вторая деталь и продолжение<ol start="2">/);
  assert.match(html, /<ol start="4"><li>Шаг четыре/);
  assert.equal(getFormattedText(content), "1. Шаг один\n2. Шаг два\n3. Шаг три\n\n  - Первая деталь\n  - Вторая деталь и продолжение\n\n    2. Глубже\n\n4. Шаг четыре");
});

test("unindented mixed markers remain separate sibling lists, never guessed children", () => {
  const result = buildManualFormattedContent("1. Первый\n2. Второй\n3. Третий\n- Деталь один\n- Деталь два");
  const tree = nestFormattedLists(result.blocks);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].nestedLists.length, 0);
  assert.match(getFormattedHtml(result), /<\/ol>\s*<ul>/u);
});

test("indented manually improved lists round-trip levels and resumed parent numbering", () => {
  assert.deepEqual(buildManualFormattedContent(getFormattedText(content)), content);
});

test("orphan levels after prose remain visible without attaching to an unrelated parent", () => {
  const blocks = [content.blocks[0], { type: "paragraph", text: "Разделитель" }, content.blocks[1]];
  assert.equal(nestFormattedLists(blocks).length, 3);
  assert.match(getFormattedHtml({ blocks }), /<p>Разделитель<\/p>\s*<ul>/u);
});

test("nested text remains escaped in both renderer and Word HTML", () => {
  const blocks = [content.blocks[0], { type: "list", level: 1, items: ['<img src=x onerror="oops">'] }];
  const html = getFormattedHtml({ blocks });
  const rendered = renderToStaticMarkup(createElement(FormattedList, { block: nestFormattedLists(blocks)[0] }));
  for (const value of [html, rendered]) {
    assert.doesNotMatch(value, /<img/u);
    assert.match(value, /&lt;img/u);
  }
});

test("explicit bullet lists retain numeric quantities instead of inferring item numbers", () => {
  assert.deepEqual(getFormattedList({ ordered: false, items: ["2 луковицы", "3 морковки"] }), {
    ordered: false, start: 2, items: ["2 луковицы", "3 морковки"]
  });
});
