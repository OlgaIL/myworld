import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { process as enrich, processImage } from "../services/aiService.js";
import { readTimewebConfig, safeTimewebSettings } from "../config/timeweb.js";
import { AI_CATEGORIES, AI_SECTIONS, AI_TEXT_QUALITY_VALUES } from "../services/aiPrompt.js";
import { runMeasuredLlmAttempt } from "../services/llmAttemptMetricsService.js";
import { applyTextCorrections } from "../utils/textCorrections.js";

export const validResponse = {
  title: "Учебный план", summary: "План занятий", category: AI_CATEGORIES[0], section: AI_SECTIONS[0],
  topic: "Учеба", tags: ["план"], formattedContent: { blocks: [{ type: "paragraph", text: "Синтетический текст для проверки." }] },
  hasTable: false, hasFormulas: false, hasRecognitionErrors: false, textQuality: AI_TEXT_QUALITY_VALUES[0], corrections: [], notes: ""
};
const quiet = { info() {}, error() {} };
const config = { enabled: true, apiKey: "synthetic-timeweb-key", model: "openai/gpt-4.1-mini", timeoutMs: 1000, maxTokens: 6000 };
export async function withGateway(handler, run) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
    handler(req, res, requests.length);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}/v1`, requests); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
function completion(res, content = JSON.stringify(validResponse), finish = "stop") {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost: 0.05,
      completion_tokens_details: { reasoning_tokens: 20 }, private: "must not escape" } }));
}
const request = (baseURL, overrides = {}, logger = quiet) => enrich("Synthetic OCR input", {
  provider: "timeweb", openAiApiKey: "wrong-openai-key", apiKey: "wrong-yandex-key",
  timeweb: { ...config, baseURL, ...overrides }, logger
});

test("uses dedicated endpoint/key/model, text prompts and full JSON", async () => {
  await withGateway((_req, res) => completion(res), async (baseURL, calls) => {
    const logs = [];
    const result = await request(baseURL, {}, { info: (...args) => logs.push(args), error() {} });
    assert.equal(result.error, undefined);
    assert.equal(result.sourceText, "Synthetic OCR input");
    assert.equal(result.cleanText, validResponse.formattedContent.blocks[0].text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/v1/chat/completions");
    assert.equal(calls[0].authorization, "Bearer synthetic-timeweb-key");
    assert.equal(calls[0].body.model, config.model);
    assert.equal(calls[0].body.max_tokens, 6000);
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
    assert.deepEqual(calls[0].body.messages.map((m) => m.role), ["system", "user"]);
    assert.match(calls[0].body.messages[0].content, /"type":"list","items":\["Первый пункт","Второй пункт"\]/);
    assert.match(calls[0].body.messages[0].content, /category выбирай ТОЧНО из списка/);
    assert.match(calls[0].body.messages[1].content, /Synthetic OCR input/);
    assert.equal(result.usage.reasoning_tokens, 20);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-timeweb-key|Synthetic OCR input|must not escape/);
  });
});

test("requests lexical corrections and returns reversible replacements from Timeweb", async () => {
  const sourceText = "Добавить мсло и соль.";
  const response = { ...validResponse,
    formattedContent: { blocks: [{ type: "paragraph", text: "Добавить масло и соль." }] },
    corrections: [{ original: "мсло", replacement: "масло" }]
  };
  await withGateway((_req, res) => completion(res, JSON.stringify(response)), async (baseURL, calls) => {
    const result = await enrich(sourceText, { provider: "timeweb", timeweb: { ...config, baseURL }, logger: quiet });
    assert.equal(result.error, undefined);
    assert.match(calls[0].body.messages[0].content, /corrections/);
    assert.match(calls[0].body.messages[0].content, /полноту corrections/);
    assert.doesNotMatch(calls[0].body.messages[1].content, /полноту corrections/);
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].original, "мсло");
    assert.equal(result.corrections[0].replacement, "масло");
    assert.equal(result.corrections[0].applied, true);
    const reverted = result.corrections.map((correction) => ({ ...correction, applied: false }));
    assert.equal(applyTextCorrections(result.formattedContent, reverted).blocks[0].text, sourceText);
    assert.equal(applyTextCorrections(result.formattedContent, result.corrections).blocks[0].text, "Добавить масло и соль.");
  });
});

test("short OCR input ends at the document text without appended service instructions", async () => {
  const sourceText = "Word2you\nЗаписи";
  const response = { ...validResponse, title: "Word2you Записи", summary: "Название сервиса",
    formattedContent: { blocks: [{ type: "paragraph", text: "Word2you Записи" }] } };
  await withGateway((_req, res) => completion(res, JSON.stringify(response)), async (baseURL, calls) => {
    const result = await enrich(sourceText, { provider: "timeweb", timeweb: { ...config, baseURL }, logger: quiet });
    const [system, user] = calls[0].body.messages;
    assert.equal(user.content.split("OCR-текст:\n").at(-1), sourceText);
    assert.doesNotMatch(user.content, /Перед отправкой JSON|Обязательно верни этот массив/);
    assert.match(system.content, /Служебные инструкции не являются частью OCR-текста/);
    assert.equal(result.cleanText, "Word2you Записи");
    assert.equal(calls.length, 1);
  });
});

test("preserves valid document text when correction metadata is absent or unusable", async () => {
  for (const corrections of [undefined, null, "invalid", [{ original: "мсло" }], [null]]) {
    await withGateway((_req, res) => completion(res, JSON.stringify({ ...validResponse, corrections })), async (baseURL) => {
      const result = await request(baseURL);
      assert.equal(result.error, undefined);
      assert.equal(result.cleanText, validResponse.formattedContent.blocks[0].text);
      assert.deepEqual(result.corrections, []);
    });
  }
});

test("classification mistakes do not discard valid document text or leak model values", async () => {
  for (const [category, section, expectedCategory, expectedSection] of [
    [" ДОКУМЕНТ ", "УЧЁБА", "документ", "учеба"],
    ["private-model-value", "private-model-value", "другое", "другое"],
    [null, undefined, "другое", "другое"],
    [{ secret: "private-model-value" }, ["private-model-value"], "другое", "другое"]
  ]) {
    const logs = [];
    await withGateway((_req, res) => completion(res, JSON.stringify({ ...validResponse, category, section })), async (baseURL, calls) => {
      const result = await request(baseURL, {}, { info() {}, error: (...args) => logs.push(args), warn: (...args) => logs.push(args) });
      assert.equal(result.error, undefined);
      assert.equal(result.category, expectedCategory);
      assert.equal(result.section, expectedSection);
      assert.equal(result.cleanText, validResponse.formattedContent.blocks[0].text);
      assert.equal(calls.length, 1);
      assert.equal(logs[0][0], "TIMEWEB LLM NORMALIZED:");
      assert.deepEqual(JSON.parse(logs[0][1]).normalizations.map((entry) => entry.field), ["category", "section"]);
      assert.doesNotMatch(JSON.stringify(logs), /private-model-value|Synthetic OCR input|synthetic-timeweb-key/);
    });
  }
});

test("preserves complete lists, surrounding paragraphs, numbering and corrections in one request", async () => {
  const sourceText = "Покупки\n3. Купить мсло\n4. Купить соль\nСохранить чек";
  const response = { ...validResponse, category: " ЧЕК ",
    formattedContent: { blocks: [
      { type: "heading", text: "Покупки" },
      { type: "list", items: ["3. Купить масло", "4. Купить соль"] },
      { type: "paragraph", text: "Сохранить чек" }
    ] }, corrections: [{ original: "мсло", replacement: "масло" }] };
  await withGateway((_req, res) => completion(res, JSON.stringify(response)), async (baseURL, calls) => {
    const result = await enrich(sourceText, { provider: "timeweb", timeweb: { ...config, baseURL }, logger: quiet });
    assert.equal(result.error, undefined);
    assert.equal(result.category, "чек");
    assert.deepEqual(result.formattedContent.blocks, [
      { type: "heading", text: "Покупки" },
      { type: "list", items: ["Купить масло", "Купить соль"], ordered: true, start: 3 },
      { type: "paragraph", text: "Сохранить чек" }
    ]);
    assert.equal(result.cleanText, "Покупки\n\n3. Купить масло\n4. Купить соль\n\nСохранить чек");
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].replacement, "масло");
    assert.equal(calls.length, 1);
  });
});

test("normalizes only lossless alternative list shapes without inventing item boundaries", async () => {
  for (const [block, expected, warning] of [
    [{ type: "list", items: [{ text: "3. Первый пункт" }, { text: "4. Второй пункт" }], ordered: true, start: 3 },
      { type: "list", items: ["Первый пункт", "Второй пункт"], ordered: true, start: 3 }, "LIST_TEXT_OBJECTS"],
    [{ type: "list", text: "Первый пункт и его\nпродолжение. Второй пункт." },
      { type: "paragraph", text: "Первый пункт и его продолжение. Второй пункт." }, "LIST_TEXT_AS_PARAGRAPH"],
    [{ type: "list", items: "Первый пункт.\nВторой пункт." },
      { type: "paragraph", text: "Первый пункт. Второй пункт." }, "LIST_TEXT_AS_PARAGRAPH"]
  ]) {
    const logs = [];
    const blocks = [{ type: "heading", text: "Начало" }, block, { type: "paragraph", text: "Конец" }];
    await withGateway((_req, res) => completion(res, JSON.stringify({ ...validResponse, formattedContent: { blocks } })), async (baseURL, calls) => {
      const result = await request(baseURL, {}, { info() {}, error() {}, warn: (...args) => logs.push(args) });
      assert.equal(result.error, undefined);
      assert.deepEqual(result.formattedContent.blocks, [blocks[0], expected, blocks[2]]);
      assert.equal(JSON.parse(logs[0][1]).normalizations[0].code, warning);
      assert.doesNotMatch(JSON.stringify(logs), /Первый пункт|Второй пункт|Начало|Конец/);
      assert.equal(calls.length, 1);
    });
  }
});

test("rejects ambiguous list shapes instead of silently dropping any item or extra content", async () => {
  for (const block of [
    { type: "list", items: ["Первый", { text: "Второй" }] },
    { type: "list", items: [{ text: "Первый", children: ["Второй"] }] },
    { type: "list", items: [{ text: "Первый" }], text: "Второй" },
    { type: "list", items: ["Первый"], text: "Второй" },
    { type: "list", items: [{ text: " " }] },
    { type: "list", items: { first: "Первый", second: "Второй" } },
    { type: "list", items: ["Первый", null, "Третий"] },
    { type: "list", items: ["Первый", 2, "Третий"] },
    { type: "list", items: "Первый", text: "Другой текст" },
    { type: "list", text: "Первый", children: ["Второй"] }
  ]) {
    await withGateway((_req, res) => completion(res, JSON.stringify({ ...validResponse, formattedContent: { blocks: [block] } })), async (baseURL, calls) => {
      const result = await request(baseURL);
      assert.equal(result.errorCode, "TIMEWEB_INVALID_JSON");
      assert.equal(result.sourceText, "Synthetic OCR input");
      assert.equal(calls.length, 1);
    });
  }
});

test("refuses content exceeding shared parser limits instead of reporting truncated text as success", async () => {
  for (const blocks of [
    Array.from({ length: 101 }, (_, index) => ({ type: "paragraph", text: `Абзац ${index}` })),
    [{ type: "list", items: Array.from({ length: 101 }, (_, index) => `Пункт ${index}`) }],
    [{ type: "paragraph", text: Array.from({ length: 101 }, (_, index) => `Абзац ${index}`).join("\n\n") }]
  ]) {
    await withGateway((_req, res) => completion(res, JSON.stringify({ ...validResponse, formattedContent: { blocks } })), async (baseURL) => {
      assert.equal((await request(baseURL)).errorCode, "TIMEWEB_INVALID_JSON");
    });
  }
});

test("validated document blocks cannot be replaced by unvalidated text aliases", async () => {
  const response = { ...validResponse, formattedText: "P|Unvalidated replacement", cleanText: "Another replacement" };
  await withGateway((_req, res) => completion(res, JSON.stringify(response)), async (baseURL) => {
    const result = await request(baseURL);
    assert.equal(result.error, undefined);
    assert.equal(result.cleanText, validResponse.formattedContent.blocks[0].text);
    assert.doesNotMatch(result.cleanText, /replacement/);
  });
});

test("mixed list structure survives one gateway request; doubtful flattening gets a safe visible warning", async () => {
  const source = "1 Первый шаг\n2 Второй шаг\n3 Третий шаг\n• Первая деталь\n• Вторая деталь\nпродолжение без маркера";
  const proper = [
    { type: "list", ordered: true, items: ["Первый шаг", "Второй шаг", "Третий шаг"] },
    { type: "list", level: 1, items: ["Первая деталь", "Вторая деталь продолжение без маркера"] }
  ];
  const flattened = [{ type: "list", ordered: true, items: [
    ...proper[0].items, "Первая деталь", "Вторая деталь", "продолжение без маркера"
  ] }];
  for (const [blocks, warning] of [[proper, false], [flattened, true]]) {
    await withGateway((_req, res) => completion(res, JSON.stringify({ ...validResponse, formattedContent: { blocks } })), async (baseURL, calls) => {
      const logs = [];
      const result = await enrich(source, { provider: "timeweb", timeweb: { ...config, baseURL },
        logger: { info() {}, error() {}, warn: (...args) => logs.push(args) } });
      assert.equal(result.error, undefined);
      assert.equal(calls.length, 1);
      assert.equal(result.hasRecognitionErrors, warning);
      if (warning) {
        assert.match(result.notes, /Проверьте список по фото/u);
        assert.equal(JSON.parse(logs[0][1]).normalizations[0].code, "LIST_STRUCTURE_REQUIRES_REVIEW");
        assert.doesNotMatch(JSON.stringify(logs), /Первый шаг|Вторая деталь|продолжение без маркера|synthetic-timeweb-key/u);
      } else {
        assert.equal(result.formattedContent.blocks[1].level, 1);
        assert.match(result.cleanText, /\n  - Вторая деталь продолжение без маркера/u);
        assert.match(calls[0].body.messages[0].content, /Не превращай их в пункты 4 и 5/u);
      }
    });
  }
});

test("guards disabled, key/model, invalid timeout/budget/URL without any HTTP call", async () => {
  await withGateway((_req, res) => completion(res), async (baseURL, calls) => {
    for (const [options, code] of [
      [{ enabled: false }, "TIMEWEB_AI_DISABLED"], [{ apiKey: "" }, "TIMEWEB_API_KEY_MISSING"],
      [{ model: " " }, "TIMEWEB_MODEL_MISSING"], [{ timeoutMs: Infinity }, "TIMEWEB_TIMEOUT_INVALID"],
      [{ timeoutMs: 0.1 }, "TIMEWEB_TIMEOUT_INVALID"], [{ maxTokens: NaN }, "TIMEWEB_MAX_TOKENS_INVALID"],
      [{ baseURL: "https://key:secret@example.test/v1" }, "TIMEWEB_BASE_URL_INVALID"]
    ]) {
      const result = await request(baseURL, options);
      assert.equal(result.errorCode, code);
      assert.equal(result.attempts, 0);
    }
    assert.equal(calls.length, 0);
  });
  assert.equal(readTimewebConfig({}).enabled, false);
  assert.equal(readTimewebConfig({}).model, "");
  assert.equal(readTimewebConfig({}).timeoutMs, 20000);
  assert.equal(readTimewebConfig({}).maxTokens, 6000);
  assert.doesNotMatch(JSON.stringify(safeTimewebSettings({ ...config, baseURL: "https://api.timeweb.ai/v1" })), /synthetic-timeweb-key|apiKey|baseURL/);
});

for (const [status, code] of [[400, "TIMEWEB_REQUEST_ERROR"], [401, "TIMEWEB_AUTH_ERROR"], [403, "TIMEWEB_AUTH_ERROR"], [422, "TIMEWEB_REQUEST_ERROR"], [429, "TIMEWEB_LIMIT_ERROR"], [500, "TIMEWEB_SERVICE_ERROR"], [503, "TIMEWEB_SERVICE_ERROR"]]) {
  test(`${status}: one SDK request, safe error and no fallback`, async () => {
    const logs = [];
    await withGateway((_req, res) => { res.writeHead(status, { "Content-Type": "application/json", "Retry-After": "0" }); res.end(JSON.stringify({ error: { message: "synthetic-timeweb-key private OCR" } })); }, async (baseURL, calls) => {
      const result = await request(baseURL, {}, { info() {}, error: (...args) => logs.push(args) });
      assert.equal(result.errorCode, code);
      assert.equal(result.attempts, 1);
      assert.equal(calls.length, 1);
      assert.doesNotMatch(JSON.stringify(logs), /synthetic-timeweb-key|private OCR/);
      assert.equal(logs[0][0], "TIMEWEB LLM ERROR:");
      assert.doesNotMatch(logs[0][1], /[\r\n]/);
      const diagnostic = JSON.parse(logs[0][1]);
      assert.equal(diagnostic.httpStatus, status);
      assert.equal(diagnostic.code, code);
      assert.ok(Number.isFinite(Date.parse(diagnostic.timestamp)));
      assert.ok(diagnostic.durationMs >= 0);
    });
  });
}
test("logs precise validation reasons without response values or parser messages", async () => {
  const privateValue = "private-document-secret";
  const body = (overrides) => JSON.stringify({ ...validResponse, ...overrides });
  const cases = [
    [`{\"${privateValue}\":`, "JSON_SYNTAX", "$"],
    ["[]", "INVALID_TYPE", "$"],
    [body({ title: undefined }), "MISSING_FIELD", "title"],
    [body({ notes: { [privateValue]: privateValue } }), "INVALID_TYPE", "notes"],
    [body({ title: " " }), "EMPTY_VALUE", "title"],
    [body({ textQuality: privateValue }), "INVALID_VALUE", "textQuality"],
    [body({ tags: undefined }), "MISSING_FIELD", "tags"],
    [body({ tags: privateValue }), "INVALID_TYPE", "tags"],
    [body({ tags: [{}] }), "INVALID_TYPE", "tags[]"],
    [body({ hasTable: undefined }), "MISSING_FIELD", "hasTable"],
    [body({ hasFormulas: privateValue }), "INVALID_TYPE", "hasFormulas"],
    [body({ formattedContent: {} }), "MISSING_FIELD", "formattedContent.blocks"],
    [body({ formattedContent: { blocks: privateValue } }), "INVALID_TYPE", "formattedContent.blocks"],
    [body({ formattedContent: { blocks: [{ type: privateValue }] } }), "INVALID_BLOCK_TYPE", "formattedContent.blocks[0].type"],
    [body({ formattedContent: { blocks: [{ type: "paragraph" }] } }), "INVALID_TYPE", "formattedContent.blocks[0].text"],
    [body({ formattedContent: { blocks: [{ type: "heading", text: " " }] } }), "EMPTY_VALUE", "formattedContent.blocks[0].text"],
    [body({ formattedContent: { blocks: [{ type: "list", items: { secret: privateValue } }] } }), "INVALID_TYPE", "formattedContent.blocks[0].items"],
    [body({ formattedContent: { blocks: [{ type: "list", items: [] }] } }), "EMPTY_VALUE", "formattedContent.blocks[0].items"],
    [body({ formattedContent: { blocks: [{ type: "list", items: [null] }] } }), "INVALID_TYPE", "formattedContent.blocks[0].items[0]"],
    [body({ formattedContent: { blocks: [{ type: "list", items: [" "] }] } }), "EMPTY_VALUE", "formattedContent.blocks[0].items[0]"],
    [body({ formattedContent: { blocks: [] }, textQuality: "low_confidence" }), "EMPTY_RESULT", "formattedContent.blocks"]
  ];
  for (const [content, reason, field] of cases) {
    await withGateway((_req, res) => completion(res, content), async (baseURL, calls) => {
      const logs = [];
      const result = await request(baseURL, {}, { info() {}, error: (...args) => logs.push(args) });
      assert.equal(result.errorCode, "TIMEWEB_INVALID_JSON");
      assert.equal(calls.length, 1);
      assert.equal(logs.length, 1);
      const diagnostic = JSON.parse(logs[0][1]);
      assert.equal(diagnostic.validationReason, reason);
      assert.equal(diagnostic.field, field);
      assert.deepEqual(diagnostic.usage, { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost: 0.05, reasoning_tokens: 20 });
      assert.doesNotMatch(JSON.stringify(logs), /private-document-secret|Synthetic OCR input|synthetic-timeweb-key|must not escape|Unexpected token/);
    });
  }
});
test("timeout is finite, classified, and not retried", async () => {
  await withGateway(() => {}, async (baseURL, calls) => {
    const result = await request(baseURL, { timeoutMs: 80 });
    assert.equal(result.errorCode, "TIMEWEB_TIMEOUT");
    assert.equal(result.failureKind, "timeout");
    assert.equal(calls.length, 1);
  });
});

test("connect timeout preserves only an allowlisted transport code, never the private error message", async () => {
  const { processTimeweb } = await import("../services/timewebAiService.js");
  const logs = [];
  let calls = 0;
  const result = await processTimeweb("private OCR", {
    timeweb: { ...config, baseURL: "https://example.test/v1" },
    logger: { error: (...args) => logs.push(args) },
    fetchImplementation: async () => {
      calls++;
      throw new TypeError("private OCR fetch failed", { cause: Object.assign(new Error("Connect Timeout Error private-key"), { code: "UND_ERR_CONNECT_TIMEOUT" }) });
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.errorCode, "TIMEWEB_TIMEOUT");
  const diagnostic = JSON.parse(logs[0][1]);
  assert.equal(diagnostic.transportCode, "UND_ERR_CONNECT_TIMEOUT");
  assert.equal(diagnostic.timeoutStage, "connect");
  assert.doesNotMatch(JSON.stringify(logs), /private OCR|private-key|example\.test/u);
});
test("network failure has no fallback/retry", async () => {
  await withGateway((req) => req.socket.destroy(), async (baseURL, calls) => {
    assert.equal((await request(baseURL)).errorCode, "TIMEWEB_NETWORK_ERROR");
    assert.equal(calls.length, 1);
  });
});
test("timeout also bounds a stalled body after HTTP headers", async () => {
  await withGateway((_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.write('{"choices":'); }, async (baseURL, calls) => {
    const started = Date.now();
    const result = await request(baseURL, { timeoutMs: 100 });
    assert.equal(result.errorCode, "TIMEWEB_TIMEOUT");
    assert.equal(calls.length, 1);
    assert.ok(Date.now() - started < 2000);
  });
});
for (const [content, finish, code] of [
  [null, "stop", "TIMEWEB_RESPONSE_EMPTY"], ["", "stop", "TIMEWEB_RESPONSE_EMPTY"],
  ["{}", "stop", "TIMEWEB_INVALID_JSON"], ["{", "stop", "TIMEWEB_INVALID_JSON"],
  [JSON.stringify(validResponse), "length", "TIMEWEB_RESPONSE_TRUNCATED"],
  [JSON.stringify(validResponse), "content_filter", "TIMEWEB_RESPONSE_INCOMPLETE"],
  [JSON.stringify({ ...validResponse, formattedContent: { blocks: [] }, textQuality: "low_confidence" }), "stop", "TIMEWEB_INVALID_JSON"]
]) {
  test(`rejects ${code} (${String(content).slice(0, 8)})`, async () => {
    await withGateway((_req, res) => completion(res, content, finish), async (baseURL, calls) => {
      const result = await request(baseURL);
      assert.equal(result.errorCode, code);
      assert.equal(result.sourceText, "Synthetic OCR input");
      assert.equal(calls.length, 1);
    });
  });
}
test("records its own safe timeweb metric and keeps fast/image compatibility", async () => {
  const calls = [];
  await runMeasuredLlmAttempt({ pipeline: { audience: "paid", pipeline: "standard", aiProvider: "timeweb" }, trigger: "retry", inputKind: "text",
    execute: async () => ({ error: "Timeweb: TIMEWEB_TIMEOUT", failureKind: "timeout" }), persist: async (_sql, values) => calls.push(values) });
  assert.equal(calls[0][3], "timeweb");
  assert.equal(calls[0][6], "timeout");
  assert.equal((await processImage("unused", { provider: "timeweb" })).error, "Image processing is only supported for OpenAI");
  assert.equal((await enrich("text", { provider: "openai" })).error, "OPENAI_API_KEY is not set");
  assert.equal((await enrich("text", { provider: "yandex" })).error, "YANDEX_API_KEY is not set");
});
