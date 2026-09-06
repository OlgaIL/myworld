import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableYandexError, process } from "../services/aiService.js";

const options = {
  provider: "yandex",
  apiKey: "test-key",
  folderId: "test-folder",
  retryDelay: async () => {}
};

test("classifies only transient Yandex request failures as retryable", () => {
  assert.equal(isRetryableYandexError({ code: "ECONNRESET" }), true);
  assert.equal(isRetryableYandexError({ response: { status: 429 } }), true);
  assert.equal(isRetryableYandexError({ response: { status: 503 } }), true);
  assert.equal(isRetryableYandexError({ response: { status: 403 } }), false);
});

test("retries a transient Yandex failure once and returns the parsed result", async () => {
  let attempts = 0;
  const httpClient = {
    async post() {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("connection reset");
        error.code = "ECONNRESET";
        throw error;
      }

      return {
        data: {
          result: {
            alternatives: [{ message: { text: JSON.stringify({ cleanText: "Готовый текст", textQuality: "full_text" }) } }]
          }
        }
      };
    }
  };

  const result = await process("Исходный текст", { ...options, httpClient });
  assert.equal(attempts, 2);
  assert.equal(result.error, undefined);
  assert.equal(result.cleanText, "Готовый текст");
});

test("returns safe retry metadata after two transient failures", async () => {
  let attempts = 0;
  const httpClient = {
    async post() {
      attempts += 1;
      const error = new Error("connection reset");
      error.code = "ECONNRESET";
      throw error;
    }
  };

  const result = await process("Исходный текст", { ...options, httpClient });
  assert.equal(attempts, 2);
  assert.equal(result.error, "Yandex GPT failed");
  assert.equal(result.errorCode, "YANDEX_AI_UNAVAILABLE");
  assert.equal(result.retryable, true);
  assert.equal(result.attempts, 2);
});
