import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYandexSystemPrompt,
  buildYandexUserPrompt,
  YANDEX_RESPONSE_JSON_SCHEMA
} from "../services/prompts/yandexPrompt.js";

test("keeps correction examples but removes the expensive final comparison", () => {
  const systemPrompt = buildYandexSystemPrompt();
  const userPrompt = buildYandexUserPrompt("Ильина Евишня");

  assert.match(systemPrompt, /"Евишня" в списке людей или рядом с именами может быть "Евгения"/);
  assert.match(systemPrompt, /сразу добавь в corrections точную пару original/);
  assert.match(systemPrompt, /Не объединяй весь многострочный OCR-текст в одну строку/);
  assert.match(systemPrompt, /обязательным префиксом: H\|/);
  assert.match(systemPrompt, /короткие подписи полей.+сохраняй отдельными строками P\|/);
  assert.doesNotMatch(systemPrompt, /Ошибки и сокращения, которые явно присутствуют в самом исходнике/);
  assert.doesNotMatch(userPrompt, /Перед отправкой JSON обязательно сравни/);
  assert.match(userPrompt, /Ильина Евишня/);
  assert.ok(systemPrompt.length < 4500);
  assert.ok(userPrompt.length < 200);
});

test("defines the Yandex response structure outside the prompt", () => {
  assert.equal(YANDEX_RESPONSE_JSON_SCHEMA.type, "object");
  assert.equal(YANDEX_RESPONSE_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(
    YANDEX_RESPONSE_JSON_SCHEMA.properties.textQuality.enum,
    ["full_text", "fragment", "low_confidence", "no_meaningful_text"]
  );
  assert.ok(YANDEX_RESPONSE_JSON_SCHEMA.required.includes("formattedText"));
  assert.equal(YANDEX_RESPONSE_JSON_SCHEMA.required.includes("formattedContent"), false);
  assert.ok(YANDEX_RESPONSE_JSON_SCHEMA.required.includes("corrections"));
  assert.match(
    YANDEX_RESPONSE_JSON_SCHEMA.properties.formattedText.description,
    /Каждая строка начинается с H\|/
  );
});
