import assert from "node:assert/strict";
import test from "node:test";
import { getRotatedImageFit, normalizeRotation } from "../src/utils/imageRotation.js";

test("normalizes clockwise and counter-clockwise rotations", () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(720), 0);
});

test("fits a sideways image using swapped visible dimensions", () => {
  const fit = getRotatedImageFit({
    naturalWidth: 1200,
    naturalHeight: 800,
    frameWidth: 400,
    frameHeight: 600,
    rotation: 90
  });

  assert.equal(fit.width, 1200);
  assert.equal(fit.height, 800);
  assert.equal(fit.scale, 0.5);
});

test("does not enlarge a small image", () => {
  const fit = getRotatedImageFit({
    naturalWidth: 300,
    naturalHeight: 200,
    frameWidth: 1200,
    frameHeight: 800,
    rotation: 0
  });

  assert.equal(fit.scale, 1);
});
