import assert from "node:assert/strict";
import test from "node:test";
import { buildManualFormattedContent } from "../src/utils/formattedText.js";
import { getFormattedHtml, getFormattedText, writeClipboardContent } from "../src/utils/formattedClipboard.js";

const improved = "Исправленная таблица\n| Год | Всего |\n| 2027 | 216,8 |\n| 2028 | 221,0 |";
const content = buildManualFormattedContent(improved);

test("clipboard HTML contains editable cells and preserves corrected values", () => {
  const html = getFormattedHtml(content);
  assert.match(html, /<table\b/);
  assert.match(html, /<th[^>]*>Год<\/th>/);
  assert.match(html, /<td[^>]*>2027<\/td><td[^>]*>216,8<\/td>/);
  assert.match(html, /<td[^>]*>2028<\/td><td[^>]*>221,0<\/td>/);
  assert.match(html, /border:1px solid/);
  assert.equal(getFormattedText(content), "Исправленная таблица\n\nГод\tВсего\n2027\t216,8\n2028\t221,0");
});

test("document text and table cells cannot insert active HTML into the clipboard", () => {
  const html = getFormattedHtml({ blocks: [
    { type: "paragraph", text: '<script>alert("x")</script>' },
    { type: "table", headers: ['<img src=x onerror=alert(1)>', "Значение"], rows: [["A&B", "1 < 2"]] }
  ] });
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A&amp;B/);
  assert.match(html, /1 &lt; 2/);
});

test("ordered lists retain their starting number in both clipboard formats", () => {
  const value = { blocks: [{ type: "list", ordered: true, start: 4, items: ["Первый", "Второй"] }] };
  assert.match(getFormattedHtml(value), /<ol start="4"><li>Первый<\/li><li>Второй<\/li><\/ol>/);
  assert.equal(getFormattedText(value), "4. Первый\n5. Второй");
});

test("one clipboard item carries the selected improved text and its HTML together", async () => {
  let written;
  const environment = {
    Blob,
    ClipboardItem: class { constructor(data) { this.data = data; } },
    navigator: { clipboard: { write: async (items) => { written = items; }, writeText: () => assert.fail("must not replace rich content with plain text") } }
  };
  const html = getFormattedHtml(content);
  await writeClipboardContent(improved, { html }, environment);
  assert.equal(written.length, 1);
  assert.equal(await written[0].data["text/plain"].text(), improved);
  assert.equal(await written[0].data["text/html"].text(), html);
});

test("plain copying keeps the selected source exactly without HTML", async () => {
  let copied;
  const source = "Исходный текст: 123,4\nВторая строка";
  await writeClipboardContent(source, undefined, { navigator: { clipboard: { writeText: async (text) => { copied = text; } } } });
  assert.equal(copied, source);
});

test("failed rich copying does not silently report a plain copy instead", async () => {
  const denied = new Error("Clipboard denied");
  const environment = {
    Blob, ClipboardItem: class {},
    navigator: { clipboard: { write: async () => { throw denied; }, writeText: () => assert.fail("silent plain fallback") } }
  };
  await assert.rejects(writeClipboardContent(improved, { html: getFormattedHtml(content) }, environment), denied);
  await assert.rejects(writeClipboardContent(improved, { html: "<table></table>" }, { navigator: { clipboard: { writeText: () => assert.fail("silent plain fallback") } } }), { code: "RICH_CLIPBOARD_UNAVAILABLE" });
});
