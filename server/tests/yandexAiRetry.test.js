import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableYandexError, process } from "../services/aiService.js";

const options = {
  provider: "yandex",
  apiKey: "test-key",
  folderId: "test-folder",
  logger: { info() {}, error() {} }
};

test("classifies only transient Yandex request failures as retryable", () => {
  assert.equal(isRetryableYandexError({ code: "ECONNRESET" }), true);
  assert.equal(isRetryableYandexError({ response: { status: 429 } }), true);
  assert.equal(isRetryableYandexError({ response: { status: 503 } }), true);
  assert.equal(isRetryableYandexError({ response: { status: 403 } }), false);
});

test("does not automatically retry a transient Yandex failure", async () => {
  let attempts = 0;
  const httpClient = {
    async post() {
      attempts += 1;
      const error = new Error("connection reset");
      error.code = "ECONNRESET";
      throw error;
    }
  };

  const result = await process("Source text", { ...options, httpClient });

  assert.equal(attempts, 1);
  assert.equal(result.error, "Yandex GPT failed");
  assert.equal(result.errorCode, "YANDEX_AI_UNAVAILABLE");
  assert.equal(result.retryable, true);
  assert.equal(result.attempts, 1);
});

test("passes the configured timeout to the Yandex request", async () => {
  let requestTimeout = null;
  const httpClient = {
    async post(_url, _body, requestOptions) {
      requestTimeout = requestOptions.timeout;
      return {
        data: {
          result: {
            alternatives: [{
              message: {
                text: JSON.stringify({ cleanText: "Ready text", textQuality: "full_text" })
              }
            }]
          }
        }
      };
    }
  };

  const result = await process("Source text", {
    ...options,
    timeoutMs: 23000,
    httpClient
  });

  assert.equal(requestTimeout, 23000);
  assert.equal(result.error, undefined);
  assert.equal(result.cleanText, "Ready text");
});

test("sends a JSON schema and logs only safe request metrics", async () => {
  const sourceText = "Confidential OCR text";
  let requestBody = null;
  const logEntries = [];
  const httpClient = {
    async post(_url, body) {
      requestBody = body;
      return {
        data: {
          result: {
            alternatives: [{
              status: "ALTERNATIVE_STATUS_FINAL",
              message: {
                text: JSON.stringify({
                  formattedContent: { blocks: [{ type: "paragraph", text: "Ready text" }] },
                  textQuality: "full_text",
                  corrections: []
                })
              }
            }],
            usage: {
              inputTextTokens: "321",
              completionTokens: "45",
              totalTokens: "366"
            },
            modelVersion: "test-version"
          }
        }
      };
    }
  };
  const logger = {
    info(message, details) {
      logEntries.push({ message, details });
    },
    error() {}
  };

  const result = await process(sourceText, { ...options, httpClient, logger });

  assert.equal(result.error, undefined);
  assert.equal(requestBody.jsonSchema.schema.type, "object");
  assert.ok(requestBody.jsonSchema.schema.required.includes("corrections"));
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0].details.sourceChars, sourceText.length);
  assert.equal(logEntries[0].details.inputTokens, 321);
  assert.equal(logEntries[0].details.completionTokens, 45);
  assert.equal(logEntries[0].details.status, "ALTERNATIVE_STATUS_FINAL");
  assert.doesNotMatch(JSON.stringify(logEntries), /Confidential OCR text/);
});
