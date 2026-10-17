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

for (const [status, code] of [[401, "TIMEWEB_AUTH_ERROR"], [403, "TIMEWEB_AUTH_ERROR"], [429, "TIMEWEB_LIMIT_ERROR"], [500, "TIMEWEB_SERVICE_ERROR"], [503, "TIMEWEB_SERVICE_ERROR"]]) {
  test(`${status}: one SDK request, safe error and no fallback`, async () => {
    const logs = [];
    await withGateway((_req, res) => { res.writeHead(status, { "Content-Type": "application/json", "Retry-After": "0" }); res.end(JSON.stringify({ error: { message: "synthetic-timeweb-key private OCR" } })); }, async (baseURL, calls) => {
      const result = await request(baseURL, {}, { info() {}, error: (...args) => logs.push(args) });
      assert.equal(result.errorCode, code);
      assert.equal(result.attempts, 1);
      assert.equal(calls.length, 1);
      assert.doesNotMatch(JSON.stringify(logs), /synthetic-timeweb-key|private OCR/);
    });
  });
}
test("timeout is finite, classified, and not retried", async () => {
  await withGateway(() => {}, async (baseURL, calls) => {
    const result = await request(baseURL, { timeoutMs: 80 });
    assert.equal(result.errorCode, "TIMEWEB_TIMEOUT");
    assert.equal(result.failureKind, "timeout");
    assert.equal(calls.length, 1);
  });
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
