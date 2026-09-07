import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTextCorrections,
  getEffectiveTextContent,
  normalizeTextCorrections
} from "../utils/textCorrections.js";

test("normalizes only replacements that exist in formatted content", () => {
  const formattedContent = {
    blocks: [
      { type: "paragraph", text: "Евгения и ЗФ" },
      { type: "list", items: ["масло", "соль"] }
    ]
  };
  const corrections = normalizeTextCorrections([
    { original: "e", replacement: "Евгения" },
    { original: "Dupen ropy", replacement: "ЗФ" },
    { original: "лишнее", replacement: "отсутствует" },
    { original: "соль", replacement: "соль" }
  ], formattedContent, "Dupen ropy и e, но не лишнее");

  assert.equal(corrections.length, 2);
  assert.deepEqual(corrections.map(({ id, original, replacement, applied }) => ({
    id,
    original,
    replacement,
    applied
  })), [
    { id: "correction-1", original: "e", replacement: "Евгения", applied: true },
    { id: "correction-2", original: "Dupen ropy", replacement: "ЗФ", applied: true }
  ]);
});

test("reverts and reapplies several corrections from canonical content", () => {
  const formattedContent = {
    blocks: [{ type: "paragraph", text: "Евгения и ЗФ" }]
  };
  const corrections = normalizeTextCorrections([
    { original: "e", replacement: "Евгения" },
    { original: "Dupen ropy", replacement: "ЗФ" }
  ], formattedContent);
  const reverted = corrections.map((correction) => ({ ...correction, applied: false }));

  assert.deepEqual(applyTextCorrections(formattedContent, reverted), {
    blocks: [{ type: "paragraph", text: "e и Dupen ropy" }]
  });
  assert.deepEqual(formattedContent, {
    blocks: [{ type: "paragraph", text: "Евгения и ЗФ" }]
  });

  const partiallyApplied = reverted.map((correction) => (
    correction.id === "correction-1" ? { ...correction, applied: true } : correction
  ));
  const effective = getEffectiveTextContent(formattedContent, partiallyApplied);

  assert.equal(effective.cleanText, "Евгения и Dupen ropy");
});
