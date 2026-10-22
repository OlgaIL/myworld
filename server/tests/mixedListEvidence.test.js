import assert from "node:assert/strict";
import test from "node:test";
import { mixedListEvidence } from "../services/prompts/mixedListEvidence.js";
import { buildTimewebTextPrompt } from "../services/prompts/timewebPrompt.js";

test("explicit mixed markers group wrapped continuations without changing OCR", () => {
  const text = "Заголовок\n1 Первый\nи продолжение\n2. Второй\n3) Третий\n• Четвёртый\n• Последний\nДлинное продолжение\nещё строка";
  const groups = mixedListEvidence(text);
  assert.deepEqual(groups.map(group => group.items.length), [3, 2]);
  assert.equal(groups[0].items[0].text, "Первый\nи продолжение");
  assert.equal(groups[1].items[1].text, "Последний\nДлинное продолжение\nещё строка");
  assert.ok(buildTimewebTextPrompt(text).includes("ровно 3 нумерованных и 2 маркированных"));
  assert.ok(buildTimewebTextPrompt(text).endsWith(text));
});

test("ambiguous, nested, separated and nonsequential lists get no boundary hint", () => {
  for (const text of [
    "Абзац без списка", "1 Один\n3 Три\n• A\n• B",
    "1 Один\n2 Два\n• A\n• B\n\nДругой абзац",
    "1 Один\n2 Два\n  • Вложенный\n• A\n• B",
    "1 Один\n2 Два\n• A\n• B\n3 Три",
    "1 Один\n2 Два\n• Только один"
  ]) assert.equal(mixedListEvidence(text), null);
});
