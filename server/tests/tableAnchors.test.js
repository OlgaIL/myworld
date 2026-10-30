import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseAIResponse, normalizeFormattedContent } from "../services/aiService.js";
import { validateTimewebJson } from "../services/timewebAiService.js";
import { validateTableSources } from "../utils/tableAnchors.js";
import { getEffectiveTextContent } from "../utils/textCorrections.js";
import { validateTablePayload, tablesToContent, extractDocumentTables, matchesTableSources } from "../services/documentTableService.js";
import { mergeFormattedTables } from "../../client/src/utils/mergeFormattedTables.js";
import { getFormattedText, getFormattedHtml } from "../../client/src/utils/formattedClipboard.js";
import { buildGoogleOcrLayout } from "../utils/ocrLayout.js";
import { buildTimewebTextSystemPrompt } from "../services/prompts/timewebPrompt.js";
import { buildYandexSystemPrompt } from "../services/prompts/yandexPrompt.js";
import { buildOpenAITextSystemPrompt, buildOpenAIImageSystemPrompt } from "../services/prompts/openaiPrompt.js";

const source = (id, text = "A 1\nB 2") => ({ type: "table_source", tableId: `table-${id}`, text });
const content = { blocks: [{ type: "paragraph", text: "До таблицы" }, source(1),
  { type: "paragraph", text: "Между таблицами" }, source(2), { type: "paragraph", text: "После таблиц" }] };
const raw = { title: "Проверка таблиц", summary: "Описание", topic: "проверка", category: "документ",
  section: "другое", tags: [], formattedContent: content, hasTable: true, hasFormulas: false,
  hasRecognitionErrors: false, textQuality: "full_text", corrections: [], notes: "" };
const table = (id) => ({ tableId: `table-${id}`, title: `Название ${id}`, headers: ["Буква", "Число"], rows: [["A", "1"], ["B", "2"]] });

test("new table slots survive normalization, persistence, corrections, extraction and clipboard", () => {
  const parsed = parseAIResponse(JSON.stringify(raw), { requireTableAnchors: true });
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.formattedContent, content);
  const stored = JSON.parse(JSON.stringify(parsed.formattedContent));
  const reopened = getEffectiveTextContent(stored, []).formattedContent;
  assert.deepEqual(reopened, content);
  assert.match(parsed.cleanText, /A 1\nB 2/);
  const extracted = tablesToContent(validateTablePayload({ tables: [table(2), table(1)] }));
  const result = mergeFormattedTables(reopened, extracted);
  assert.equal(result.merged, true);
  assert.deepEqual(result.content.blocks.map((block) => block.type), ["paragraph", "heading", "table", "paragraph", "heading", "table", "paragraph"]);
  assert.deepEqual(result.content.blocks.filter((block) => block.type === "table").map((block) => block.tableId), ["table-1", "table-2"]);
  assert.deepEqual(result.content.blocks.filter((block) => block.type === "paragraph"), content.blocks.filter((block) => block.type === "paragraph"));
  assert.match(getFormattedText(result.content), /A\t1/);
  assert.equal((getFormattedHtml(result.content).match(/<table /gu) || []).length, 2);
  assert.deepEqual(reopened, content);
});

test("rejects missing, duplicate, invalid or skipped slot IDs without discarding source text", () => {
  for (const blocks of [[source(1), source(1)], [source(2)], [{ ...source(1), text: "" }], [{ ...source(1), tableId: "bad" }]]) {
    assert.throws(() => normalizeFormattedContent({ blocks }), /INVALID_TABLE_ANCHORS/);
  }
  assert.throws(() => validateTableSources({ blocks: [] }, { required: true }), /INVALID_TABLE_ANCHORS/);
  assert.equal(validateTableSources({ blocks: [{ type: "paragraph", text: "Обычный текст" }] }).length, 0);
  for (const tables of [[table(1)], [table(1), table(1)], [table(1), table(3)]]) {
    const result = mergeFormattedTables(content, tablesToContent(tables));
    assert.equal(result.merged, false);
    assert.equal(result.content, content);
  }
});

test("a contiguous source region can contain multiple separately numbered tables", () => {
  const sources = [source(1), source(2)];
  const parts = [{ ...table(1), tablePart: 1 }, { ...table(1), tablePart: 2 }, table(2)];
  assert.equal(matchesTableSources(parts, sources), true);
  const formatted = { blocks: [source(1), { type: "paragraph", text: "Сохранить расчёт" }, source(2)] };
  const result = mergeFormattedTables(formatted, tablesToContent(validateTablePayload({ tables: parts })));
  assert.equal(result.merged, true);
  assert.equal(result.content.blocks.filter((block) => block.type === "table").length, 3);
  assert.equal(result.content.blocks[4].text, "Сохранить расчёт");
  for (const invalid of [[parts[1], parts[0], parts[2]], [parts[0], parts[0], parts[2]], [parts[0], parts[2], parts[1]]]) {
    assert.equal(matchesTableSources(invalid, sources), false);
  }
});

test("all production prompts request the same slot contract; Timeweb accepts it", () => {
  for (const prompt of [buildTimewebTextSystemPrompt(), buildYandexSystemPrompt(), buildOpenAITextSystemPrompt(), buildOpenAIImageSystemPrompt()]) {
    assert.match(prompt, /table_source/);
    assert.match(prompt, /tableId/);
  }
  assert.deepEqual(validateTimewebJson(JSON.stringify(raw)).formattedContent, content);
});

test("real extraction service passes slots to the model and rejects missing or swapped IDs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "word2you-table-slots-"));
  const image = path.join(directory, "synthetic.png");
  await fs.writeFile(image, "synthetic-image");
  const annotations = [{ description: "Two synthetic tables" }];
  const word = (description, x, y) => ({ description, boundingPoly: { vertices: [
    { x, y }, { x: x + 35, y }, { x: x + 35, y: y + 12 }, { x, y: y + 12 }] } });
  for (const offset of [0, 200]) {
    annotations.push(word("Буква", 30, 40 + offset), word("Число", 140, 40 + offset),
      word("A", 30, 80 + offset), word("1", 140, 80 + offset), word("B", 30, 110 + offset), word("2", 140, 110 + offset));
  }
  try {
    for (const [tables, expected] of [[ [table(1), table(2)], "ready" ],
      [[{...table(1),tableId:undefined},{...table(2),tableId:undefined}],"ready"], [[table(2), table(1)], "review"],
      [[{ ...table(1), tableId: undefined }, table(2)], "review"], [[table(1)], "review"]]) {
      let requests = 0;
      const result = await extractDocumentTables({ formatted_content: content, storage_path: image, mime_type: "image/png" }, {
        config: { enabled: true, apiKey: "synthetic", baseURL: "https://synthetic.invalid/v1", model: "synthetic", timeoutMs: 1000, maxTokens: 6000, pageInventory:false },
        resolveImage: async () => image,
        layout: buildGoogleOcrLayout({ textAnnotations: annotations }, Buffer.from("synthetic-image"), annotations[0].description),
        client: { chat: { completions: { create: async (request) => {
          requests++;
          assert.match(request.messages[1].content[0].text, /Ориентируйся на фото/);
          assert.equal(request.messages[1].content[0].text.includes("Координаты слов"),false);
          return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ tables }) } }] };
        } } } }
      });
      assert.equal(requests, 1);
      assert.equal(result.status, expected);
      if (expected === "ready") assert.equal(mergeFormattedTables(content, result.content).merged, true);
      else assert.equal(result.code, "TABLE_ANCHOR_MISMATCH");
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
