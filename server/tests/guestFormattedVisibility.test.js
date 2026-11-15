import assert from "node:assert/strict";
import test from "node:test";
import { mapGuestDocumentInfo } from "../utils/guest.js";
import { mapPhotoInfo } from "../utils/photos.js";
import { isRedundantFormattedVariant } from "../../client/src/utils/formattedVariantVisibility.js";
import { promoteDocumentTitle } from "../../shared/formattedVariantRules.mjs";

const paragraph = text => ({ type: "paragraph", text });
const text = "Первый абзац.\n\nВторой абзац.";
const base = { id: 1, filename: "synthetic.jpg", title: "Запись", status: "processed",
  ocr_text: text, clean_text: text, has_table: false,
  formatted_content: { blocks: [paragraph("Первый абзац."), paragraph("Второй абзац.")] } };

test("guest duplicate flag is conservative and never publishes protected formatting", async t => {
  const cases = [
    ["exact paragraphs", {}, true],
    ["missing formatting is unknown", { formatted_content: null }, false],
    ["empty blocks are unknown", { formatted_content: { blocks: [] } }, false],
    ["unknown block", { formatted_content: { blocks: [{ type: "formula", text }] } }, false],
    ["unknown paragraph metadata", { formatted_content: { blocks: [{ ...paragraph(text), indent: 1 }] } }, false],
    ["heading", { formatted_content: { blocks: [{ type: "heading", text: "Первый абзац." }, paragraph("Второй абзац.")] } }, false],
    ["title promoted by the existing UI", { title: "Первый абзац." }, false],
    ["list", { formatted_content: { blocks: [{ type: "list", items: [text] }] } }, false],
    ["table", { formatted_content: { blocks: [{ type: "table", headers: ["A"], rows: [["B"]] }] } }, false],
    ["table source", { formatted_content: { blocks: [{ type: "table_source", text }] } }, false],
    ["possible table", { has_table: true }, false],
    ["saved table awaiting download", { table_status: "ready" }, false],
    ["table error", { table_status: "error" }, false],
    ["unknown table state", { table_status: "unknown" }, false],
    ["table data before status refresh", { table_content: { blocks: [{ type: "table" }] } }, false],
    ["processing", { status: "processing" }, false],
    ["OCR only", { status: "recognized" }, false],
    ["error", { status: "error" }, false],
    ["empty text", { ocr_text: "", clean_text: "", formatted_content: { blocks: [paragraph("")] } }, false],
    ["internal blank line differs from two paragraphs", { formatted_content: { blocks: [paragraph(text)] } }, false]
  ];
  for (const [name, changes, expected] of cases) await t.test(name, () => {
    const stored = { ...base, ...changes };
    const before = structuredClone(stored);
    const guest = mapGuestDocumentInfo(stored);
    assert.equal(guest.formattedIsRedundant, expected);
    assert.equal(guest.formattedContent, null, "guest response must not reveal blocks, even when useful");
    assert.ok(!JSON.stringify(guest).includes('"blocks"'));
    assert.deepEqual(stored, before, "visibility must not rewrite saved results");
    // The same saved result survives a guest claim. Authenticated mapping still
    // supplies real formatting, independently of any guest visibility flag.
    const authenticated = mapPhotoInfo(stored);
    assert.deepEqual(authenticated.formattedContent, stored.formatted_content);
    if (stored.formatted_content?.blocks?.length) assert.equal(isRedundantFormattedVariant({
      content: promoteDocumentTitle(authenticated.formattedContent, authenticated.title),
      text: authenticated.cleanText || authenticated.text, isAuthenticated: true,
      status: stored.status, hasTable: stored.has_table, tableStatus: stored.table_status,
      tableContent: stored.table_content
    }), expected, "guest and authenticated decisions agree for a known stored result");
  });
});

test("literal comparison preserves case, symbols, spacing and paragraph boundaries", () => {
  const common = { isAuthenticated: true, status: "processed", content: base.formatted_content };
  for (const changed of [text.toLowerCase(), text.replace(".", ";"), text.replace(" ", "  "), `  ${text}`, text.replace("\n\n", "\n")])
    assert.equal(isRedundantFormattedVariant({ ...common, text: changed }), false);
  assert.equal(isRedundantFormattedVariant({ ...common, text }), true);
});
