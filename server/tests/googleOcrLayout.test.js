import assert from "node:assert/strict";
import test from "node:test";
import {
  hasDetachedLeadingNumbers,
  reconstructGoogleOcrLines,
  repairDetachedLeadingNumbers
} from "../utils/googleOcrLayout.js";

function annotation(text, left, top, right, bottom) {
  return {
    description: text,
    boundingPoly: {
      vertices: [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom }
      ]
    }
  };
}

test("detects list numbers detached by Google OCR ordering", () => {
  assert.equal(hasDetachedLeadingNumbers("1\n2\nЗаголовок\nПервый пункт"), true);
  assert.equal(hasDetachedLeadingNumbers("1. Первый пункт\n2. Второй пункт"), false);
  assert.equal(hasDetachedLeadingNumbers("Обычный текст"), false);
});

test("reconstructs OCR lines by coordinates and keeps markers with their text", () => {
  const annotations = [
    { description: "1\n2\nПлан\nПервый пункт\nВторой пункт" },
    annotation("1", 10, 100, 20, 130),
    annotation("2", 10, 200, 20, 230),
    annotation("План", 40, 20, 100, 50),
    annotation("Первый", 40, 95, 110, 135),
    annotation("пункт", 120, 95, 180, 135),
    annotation("Второй", 40, 195, 115, 235),
    annotation("пункт", 125, 195, 185, 235),
    annotation("•", 12, 280, 20, 305),
    annotation("Подпункт", 40, 275, 140, 310)
  ];

  assert.equal(
    reconstructGoogleOcrLines(annotations),
    "План\n1 Первый пункт\n2 Второй пункт\n• Подпункт"
  );
});

test("moves only detached numbers and preserves the original OCR wording", () => {
  const annotations = [
    { description: "1\n2\nШаги\nПервый пункт\nВторой пункт" },
    annotation("Julio", 40, 20, 100, 50),
    annotation("1", 10, 100, 20, 130),
    annotation("Первый", 40, 95, 110, 135),
    annotation("пункт", 120, 95, 180, 135),
    annotation("2", 10, 200, 20, 230),
    annotation("Второй", 40, 195, 115, 235),
    annotation("пункт", 125, 195, 185, 235)
  ];

  assert.equal(
    repairDetachedLeadingNumbers("1\n2\nШаги\nПервый пункт\nВторой пункт", annotations),
    "Шаги\n1 Первый пункт\n2 Второй пункт"
  );
});
