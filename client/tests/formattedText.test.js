import assert from "node:assert/strict";
import test from "node:test";
import { capitalizeFormattedLine } from "../src/utils/formattedText.js";

test("capitalizes the first letter after leading punctuation or numbers", () => {
  assert.equal(capitalizeFormattedLine("новый абзац"), "Новый абзац");
  assert.equal(capitalizeFormattedLine("  «новый абзац»"), "  «Новый абзац»");
  assert.equal(capitalizeFormattedLine("1. новый пункт"), "1. Новый пункт");
});

test("keeps already capitalized text and text without letters unchanged", () => {
  assert.equal(capitalizeFormattedLine("Готовый текст"), "Готовый текст");
  assert.equal(capitalizeFormattedLine("123 + 456"), "123 + 456");
  assert.equal(capitalizeFormattedLine(""), "");
});
