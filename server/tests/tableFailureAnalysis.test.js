import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { analyzeTableFailure, tableRepairInstruction } from "../utils/tableFailureAnalysis.js";
import { extractDocumentTables, validateTablePayload } from "../services/documentTableService.js";
import { getDocumentTableOptions } from "../config/documentTables.js";
import { getTimewebOptions } from "../services/processingPipelineService.js";
import { buildGoogleOcrLayout } from "../utils/ocrLayout.js";
import { mapPhotoInfo } from "../utils/photos.js";

const table = { title: "", headers: ["Name", "Value"], rows: [["Alpha", "100"], ["Beta", "200"]] };
const initial = diagnostic => ({ version: 1, phase: "initial", model: "openai/gpt-4.1-mini", diagnostic });

test("tables take the ordinary GPT configuration, ignoring the old Gemini override", () => {
  const config = getDocumentTableOptions({ TABLE_MODEL: "gemini/gemini-3.1-pro-preview" });
  assert.equal(config.model, getTimewebOptions().model);
  assert.ok(Number.isNaN(config.inputRubPerMillion));
  assert.ok(Number.isNaN(config.outputRubPerMillion));
  assert.equal(config.pageInventory,false);
  assert.equal(getDocumentTableOptions({TABLE_PAGE_INVENTORY_ENABLED:"true"}).pageInventory,true);
  const oldPlacement={...initial({stage:"placement",reason:"SOURCE_RANGE_MISMATCH"}),gridEvidence:{status:"detected",columns:[4,8]}};
  assert.equal(analyzeTableFailure("review","TABLE_SOURCE_RANGE_MISMATCH",oldPlacement).retryable,false);
  assert.equal(analyzeTableFailure("review","TABLE_SOURCE_RANGE_MISMATCH",oldPlacement,{pageInventory:true}).action,"inventory_page");
});

test("the first GPT request explicitly lists every independently detected table caption", async () => {
  const bytes = await fs.readFile(new URL(import.meta.url));
  const annotations = [{ description: "Таблица 17\nТаблица 18\nName Value Alpha 100" },
    { description: "Name", boundingPoly: { vertices: [{ x: 1, y: 1 }, { x: 30, y: 10 }] } }];
  let calls = 0;
  const result = await extractDocumentTables({ mime_type: "image/png", storage_path: "synthetic" }, {
    config: { enabled: true, apiKey: "synthetic", model: "openai/gpt-4.1-mini", baseURL: "https://synthetic.invalid/v1", timeoutMs: 1000, maxTokens: 6000 },
    resolveImage: async () => new URL(import.meta.url),
    layout: buildGoogleOcrLayout({ textAnnotations: annotations }, bytes, annotations[0].description),
    client: { chat: { completions: { create: async request => {
      calls++;
      assert.match(request.messages[1].content[0].text, /На фото найдены заголовки таблиц: 17, 18\. Извлеки все эти таблицы\./u);
      return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ tables: [table] }) } }] };
    } } } }
  });
  assert.equal(calls, 1);
  assert.equal(result.code, "TABLE_COUNT_MISMATCH");
  assert.deepEqual(result.validationDiagnostic, { stage: "grid", reason: "TABLE_COUNT", actual: 1, expected: 2 });
});

test("structure failures identify the exact predicate and field without cell contents", () => {
  const cases = [
    ["not JSON PRIVATE_TEXT", "JSON_SYNTAX", "$"],
    [null, "ROOT_TYPE", "$"],
    [{ tables: null }, "TABLES_TYPE", "tables"],
    [{ tables: Array(11).fill(table) }, "TABLE_LIMIT", "tables"],
    [{ tables: [null] }, "TABLE_TYPE", "tables[0]"],
    [{ tables: [{ ...table, title: null }] }, "TITLE_TYPE", "tables[0].title"],
    [{ tables: [{ ...table, title: "x".repeat(301) }] }, "TITLE_LENGTH", "tables[0].title"],
    [{ tables: [{ ...table, headers: null }] }, "HEADERS_TYPE", "tables[0].headers"],
    [{ tables: [{ ...table, headers: ["Name"] }] }, "COLUMN_COUNT", "tables[0].headers"],
    [{ tables: [{ ...table, headers: Array(21).fill("a") }] }, "COLUMN_LIMIT", "tables[0].headers"],
    [{ tables: [{ ...table, rows: null }] }, "ROWS_TYPE", "tables[0].rows"],
    [{ tables: [{ ...table, rows: [] }] }, "NO_ROWS", "tables[0].rows"],
    [{ tables: [{ ...table, rows: Array(101).fill(table.rows[0]) }] }, "ROW_LIMIT", "tables[0].rows"],
    [{ tables: [{ ...table, rows: [null] }] }, "ROW_TYPE", "tables[0].rows[0]"],
    [{ tables: [{ ...table, rows: [["PRIVATE_TEXT"]] }] }, "ROW_WIDTH", "tables[0].rows[0]"],
    [{ tables: [{ ...table, rows: [["PRIVATE_TEXT", 100]] }] }, "CELL_TYPE", "tables[0].rows[0][1]"],
    [{ tables: [{ ...table, rows: [["PRIVATE_TEXT", "x".repeat(301)]] }] }, "CELL_LENGTH", "tables[0].rows[0][1]"],
    [{ tables: [{ ...table, headers: ["Name", ""] }] }, "EMPTY_HEADERS", "tables[0].headers"],
    [{ tables: [{ ...table, rows: [["", ""]] }] }, "EMPTY_ROW", "tables[0].rows[0]"],
    [{ tables: [{ ...table, tableId: "PRIVATE_TEXT" }] }, "INVALID_ID", "tables[0].tableId"],
    [{ tables: [{ ...table, tableId: "table-1", tablePart: 0 }] }, "INVALID_PART", "tables[0].tablePart"]
  ];
  for (const [payload, reason, field] of cases) {
    assert.throws(() => validateTablePayload(payload), error => {
      assert.match(error.message, /^TABLE_INVALID_(STRUCTURE|ID|PART)$/u);
      assert.equal(error.diagnostic.reason, reason);
      assert.equal(error.diagnostic.field, field);
      assert.equal(JSON.stringify(error).includes("PRIVATE_TEXT"), false);
      return true;
    });
  }
  assert.throws(() => validateTablePayload({ tables: [{ ...table, rows: [["Alpha"]] }] }), error => {
    assert.deepEqual(error.diagnostic, { stage: "structure", reason: "ROW_WIDTH", field: "tables[0].rows[0]", actual: 1, expected: 2 });
    return true;
  });
  const sparse = { title: "", headers: ["Code", "Name", "Value"], rows: [["", "Alpha", "100,00"]] };
  assert.deepEqual(validateTablePayload({ tables: [sparse] }), [sparse]);
});

test("missing title is recovered from independent source or left empty without changing any cells", () => {
  const payload = { tables: [{ headers: table.headers, rows: table.rows }] };
  const before = structuredClone(payload), normalizations = [];
  const fromSource = validateTablePayload(payload, { sourceTitles: ["Printed source caption"], normalizations });
  assert.equal(fromSource[0].title, "Printed source caption");
  assert.deepEqual(fromSource[0].rows, table.rows);
  assert.deepEqual(fromSource[0].headers, table.headers);
  assert.deepEqual(normalizations, [{ reason: "TITLE_FROM_SOURCE", table: 0 }]);
  assert.equal(validateTablePayload(payload)[0].title, "");
  assert.deepEqual(payload, before);
  assert.throws(() => validateTablePayload({ tables: [{ headers: table.headers, rows: [["Alpha"]] }] }),
    error => error.diagnostic.reason === "ROW_WIDTH");
});

test("a retry requires a known format defect; grid, limits and placement have different plans", () => {
  const diagnostic = { stage: "structure", reason: "CELL_TYPE", field: "tables[0].rows[0][1]" };
  assert.deepEqual(analyzeTableFailure("review", "TABLE_INVALID_STRUCTURE", initial(diagnostic)),
    { kind: "format", action: "repair_format", retryable: true });
  assert.equal(analyzeTableFailure("review", "TABLE_INVALID_STRUCTURE", { ...initial(diagnostic), phase: "format_repair" }).retryable, false);
  assert.equal(analyzeTableFailure("review", "TABLE_INVALID_STRUCTURE").retryable, false);
  assert.equal(analyzeTableFailure("review", "TABLE_INVALID_STRUCTURE", { ...initial(diagnostic), model: "gemini/gemini-3.1-pro-preview" }).retryable, false);
  assert.deepEqual(analyzeTableFailure("review", "TABLE_INVALID_STRUCTURE", initial({ stage: "structure", reason: "ROW_WIDTH" })),
    { kind: "grid", action: "review_grid", retryable: false });
  assert.deepEqual(analyzeTableFailure("review", "TABLE_INVALID_STRUCTURE", initial({ stage: "structure", reason: "CELL_LENGTH" })),
    { kind: "limit", action: "plan_split", retryable: false });
  assert.equal(analyzeTableFailure("review", "TABLE_SOURCE_RANGE_MISMATCH").action, "review_placement");
  assert.equal(analyzeTableFailure("review", "CELL_VALUE_MISMATCH").action, "review_grid");
  assert.equal(analyzeTableFailure("error", "TABLE_TIMEOUT").action, "retry_connection");
  const publicInfo = mapPhotoInfo({ table_status: "review", table_error_code: "TABLE_INVALID_STRUCTURE", table_processing_context: initial(diagnostic) });
  assert.equal(publicInfo.tableRetryable, true);
  assert.equal(publicInfo.tableNextAction, "repair_format");
  assert.equal("table_processing_context" in publicInfo, false);
  assert.equal(JSON.stringify(publicInfo).includes("tables[0].rows"), false);
  assert.equal(tableRepairInstruction({ reason: "CELL_TYPE", field: "PRIVATE_INSTRUCTION" }).includes("PRIVATE_INSTRUCTION"), false);
});

test("one user retry stays on GPT, adds a specific correction, reuses OCR and stops after another format failure", async () => {
  const bytes = await fs.readFile(new URL(import.meta.url));
  const word = (description, x, y) => ({ description, boundingPoly: { vertices: [{ x, y }, { x: x + 30, y: y + 10 }] } });
  const annotations = [{ description: "Name Value Alpha 100 Beta 200" }, word("Name", 30, 40), word("Value", 140, 40),
    word("Alpha", 30, 80), word("100", 140, 80), word("Beta", 30, 110), word("200", 140, 110)];
  const layout = buildGoogleOcrLayout({ textAnnotations: annotations }, bytes, annotations[0].description);
  const requests = [];
  let content = JSON.stringify({ tables: [{ ...table, rows: [["Alpha", 100]] }] });
  const options = {
    config: { enabled: true, apiKey: "synthetic", model: "openai/gpt-4.1-mini", baseURL: "https://synthetic.invalid/v1", timeoutMs: 1000, maxTokens: 6000 },
    resolveImage: async () => new URL(import.meta.url), loadLayout: async () => layout,
    client: { chat: { completions: { create: async request => {
      requests.push(request);
      return { choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } };
    } } } }
  };
  const photo = { storage_path: "synthetic", mime_type: "image/png", formatted_content: { blocks: [
    { type: "table_source", tableId: "table-1", text: "Name Value Alpha 100 Beta 200" }
  ] } };
  const first = await extractDocumentTables(photo, options);
  assert.equal(first.validationDiagnostic.reason, "CELL_TYPE");
  assert.equal(first.model, "openai/gpt-4.1-mini");
  assert.equal(first.tableContext.phase, "initial");
  assert.equal(requests.length, 1);
  const retryPhoto = { ...photo, table_status: first.status, table_error_code: first.code, table_processing_context: first.tableContext };
  const rejectedAgain = await extractDocumentTables(retryPhoto, options);
  assert.equal(requests.length, 2);
  assert.equal(rejectedAgain.tableContext.phase, "format_repair");
  assert.equal(analyzeTableFailure(rejectedAgain.status, rejectedAgain.code, rejectedAgain.tableContext).retryable, false);
  assert.equal(requests[1].model, requests[0].model);
  assert.match(requests[1].messages[1].content[0].text, /tables\[0\]\.rows\[0\]\[1\]/u);
  assert.match(requests[1].messages[1].content[0].text, /Пустая ячейка/u);
  assert.equal(requests[1].messages[1].content[0].text.includes('"Alpha",100'), false);

  content = JSON.stringify({ tables: [table] });
  const ready = await extractDocumentTables(retryPhoto, options);
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.content.blocks[0].rows, table.rows);
  assert.equal(ready.estimatedCostRub, null);

  const timeoutOptions = { ...options, client: { chat: { completions: { create: async () => { throw new Error("PRIVATE_PROVIDER_ERROR"); } } } } };
  const temporary = await extractDocumentTables(retryPhoto, timeoutOptions);
  assert.equal(temporary.code, "TABLE_PROVIDER_UNAVAILABLE");
  assert.equal(temporary.tableContext.phase, "format_repair");
  assert.equal(temporary.tableContext.repairDiagnostic.reason, "CELL_TYPE");
  assert.equal(JSON.stringify(temporary).includes("PRIVATE_PROVIDER_ERROR"), false);
  const afterTemporary = await extractDocumentTables({ ...retryPhoto, table_status: temporary.status,
    table_error_code: temporary.code, table_processing_context: temporary.tableContext }, options);
  assert.equal(afterTemporary.status, "ready");
  assert.equal(afterTemporary.tableContext.phase, "format_repair");
  assert.match(requests.at(-1).messages[1].content[0].text, /Пустая ячейка/u);
});
