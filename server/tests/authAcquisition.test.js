import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAcquisitionContext } from "../routes/authRoutes.js";

test("keeps campaign intent and landing path without personal fields", () => {
  const context = sanitizeAcquisitionContext({
    utm_source: "yandex",
    yclid: "123456",
    intent: "handwriting_to_text",
    landing_path: "/handwriting-to-text?utm_source=yandex",
    email: "must-not-pass@example.test"
  });

  assert.deepEqual(context, {
    utm_source: "yandex",
    yclid: "123456",
    intent: "handwriting_to_text",
    landing_path: "/handwriting-to-text?utm_source=yandex"
  });
});
