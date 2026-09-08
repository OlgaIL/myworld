import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYandexSystemPrompt,
  buildYandexUserPrompt
} from "../services/prompts/yandexPrompt.js";

test("requires every lexical correction to be reported", () => {
  assert.match(buildYandexSystemPrompt(), /Каждую фактическую лексическую замену запиши в corrections/);
  assert.match(
    buildYandexUserPrompt("Ильина Евишня"),
    /"original": "Евишня", "replacement": "Евгения"/
  );
});
