import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYandexSystemPrompt,
  buildYandexUserPrompt
} from "../services/prompts/yandexPrompt.js";

test("requires every lexical correction to be reported", () => {
  const systemPrompt = buildYandexSystemPrompt();
  const userPrompt = buildYandexUserPrompt("Ильина Евишня");

  assert.match(systemPrompt, /Каждую фактическую лексическую замену запиши в corrections/);
  assert.match(userPrompt, /"original": "Евишня", "replacement": "Евгения"/);
});

test("requests complete structured content without splitting wrapped lines", () => {
  const systemPrompt = buildYandexSystemPrompt();
  const userPrompt = buildYandexUserPrompt("Первая строка");

  assert.match(systemPrompt, /Каждый самостоятельный абзац возвращай отдельным блоком paragraph/);
  assert.match(systemPrompt, /Перенос строки внутри одного длинного пункта не означает начало нового пункта/);
  assert.match(userPrompt, /"formattedContent"/);
  assert.match(userPrompt, /"type": "heading"/);
});
