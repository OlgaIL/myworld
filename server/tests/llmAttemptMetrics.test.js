import assert from "node:assert/strict";
import test from "node:test";
import { isDatabaseConfigured, withTransaction } from "../db/index.js";
import { process } from "../services/aiService.js";
import { classifyLlmOutcome, runMeasuredLlmAttempt } from "../services/llmAttemptMetricsService.js";

const pipeline = { audience: "guest", pipeline: "standard", aiProvider: "yandex" };

test("classifies successful, timed-out, and other LLM results", () => {
  assert.equal(classifyLlmOutcome({ title: "ok" }), "success");
  assert.equal(classifyLlmOutcome({ error: "failed", failureKind: "timeout" }), "timeout");
  assert.equal(classifyLlmOutcome({ error: "failed", failureKind: "error" }), "error");
});

test("marks an actual Yandex request timeout for event classification", async () => {
  const result = await process("Test OCR text", {
    provider: "yandex",
    apiKey: "test-key",
    folderId: "test-folder",
    logger: { error() {} },
    httpClient: {
      async post() {
        throw Object.assign(new Error("timeout of 20000ms exceeded"), { code: "ECONNABORTED" });
      }
    }
  });

  assert.equal(result.failureKind, "timeout");
  assert.equal(classifyLlmOutcome(result), "timeout");
});

test("records a safe event without document content", async () => {
  const calls = [];
  const result = await runMeasuredLlmAttempt({
    pipeline,
    trigger: "retry",
    inputKind: "text",
    execute: async () => ({ error: "Yandex GPT failed", failureKind: "timeout" }),
    persist: async (...args) => calls.push(args)
  });

  assert.equal(result.failureKind, "timeout");
  assert.equal(calls.length, 1);
  const [sql, values] = calls[0];
  assert.match(sql, /insert into llm_attempt_events/);
  assert.equal(values[1], "guest");
  assert.equal(values[4], "retry");
  assert.equal(values[6], "timeout");
  assert.ok(values[7] >= 0);
  assert.equal(values.some((value) => typeof value === "string" && value.includes("Yandex GPT failed")), false);
});

test("a metrics write failure does not change the LLM result", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await runMeasuredLlmAttempt({
      pipeline,
      trigger: "upload",
      inputKind: "text",
      execute: async () => ({ title: "ok" }),
      persist: async () => { throw Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" }); }
    });
    assert.equal(result.title, "ok");
  } finally {
    console.error = originalError;
  }
});

test("records an exception and preserves it", async () => {
  const calls = [];
  const expected = new Error("LLM failed");
  await assert.rejects(runMeasuredLlmAttempt({
    pipeline,
    trigger: "upload",
    inputKind: "image",
    execute: async () => { throw expected; },
    persist: async (_sql, values) => calls.push(values)
  }), (error) => error === expected);
  assert.equal(calls[0][6], "error");
});

test("persists a metrics row in PostgreSQL without retaining test data", { skip: !isDatabaseConfigured() }, async () => {
  const rollback = new Error("rollback test event");
  let checked = false;

  await assert.rejects(withTransaction(async (client) => {
    let eventId;
    await runMeasuredLlmAttempt({
      pipeline,
      trigger: "upload",
      inputKind: "text",
      execute: async () => ({ title: "ok" }),
      persist: async (sql, values) => {
        const inserted = await client.query(`${sql} returning id`, values);
        eventId = inserted.rows[0].id;
      }
    });
    const stored = await client.query("select outcome, audience from llm_attempt_events where id = $1", [eventId]);
    assert.equal(stored.rows[0].outcome, "success");
    assert.equal(stored.rows[0].audience, "guest");
    checked = true;
    throw rollback;
  }), (error) => error === rollback);

  assert.equal(checked, true);
});
