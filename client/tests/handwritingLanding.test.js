import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  captureAcquisitionContext,
  getAcquisitionContext
} from "../src/services/analytics.js";
import {
  getCrossDeviceBlockViewParams,
  getCrossDeviceCtaParams,
  getHandwritingLandingCtaParams,
  getHandwritingLandingViewParams,
  trackCrossDeviceBlockView,
  trackCrossDeviceCtaClick,
  trackHandwritingLandingCta,
  trackHandwritingLandingView
} from "../src/utils/handwritingLandingAnalytics.js";

const landingSource = readFileSync(new URL("../src/pages/HandwritingToTextLanding.jsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const photoLandingSource = readFileSync(new URL("../src/pages/PhotoToTextLanding.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

function createStorage() {
  const values = new Map();

  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test("connects the handwriting route and keeps the photo-to-text landing available", () => {
  assert.match(mainSource, /Route path="\/handwriting-to-text" element=\{<HandwritingToTextLanding \/>\}/);
  assert.match(mainSource, /Route path="\/photo-to-text" element=\{<PhotoToTextLanding \/>\}/);
  assert.match(photoLandingSource, /to="\/handwriting-to-text"/);
});

test("has one H1, the correct allowance and product-style upload CTAs without a 30-treatment claim", () => {
  assert.equal((landingSource.match(/<h1>/g) || []).length, 1);
  assert.match(landingSource, /5 обработок без регистрации · ещё 10 после входа/);
  assert.doesNotMatch(landingSource, /30\s*(бесплатных\s*)?обработ/iu);
  assert.equal((landingSource.match(/to="\/"/g) || []).length >= 2, true);
  assert.match(landingSource, /handleCtaClick\("hero"\)/);
  assert.match(landingSource, /handleCtaClick\("final"\)/);
  assert.equal((landingSource.match(/handwriting-upload-cta/g) || []).length >= 3, true);
  assert.doesNotMatch(landingSource, /редактир/iu);
});

test("builds view and CTA analytics events with the requested parameters", () => {
  const calls = [];
  const track = (goal, params) => calls.push({ goal, params });

  trackHandwritingLandingView({ search: "?intent=notebooks", track });
  trackHandwritingLandingCta({ search: "?intent=notes", placement: "final", track });

  assert.deepEqual(calls, [
    {
      goal: "handwriting_landing_view",
      params: {
        landing: "handwriting_to_text",
        intent: "notebooks",
        path: "/handwriting-to-text"
      }
    },
    {
      goal: "handwriting_landing_cta_click",
      params: {
        landing: "handwriting_to_text",
        intent: "notes",
        placement: "final",
        destination: "/"
      }
    }
  ]);
  assert.equal(getHandwritingLandingViewParams("").intent, "handwriting");
  assert.equal(getHandwritingLandingCtaParams({ placement: "hero" }).destination, "/");
});

test("preserves acquisition context and saves the landing intent before the upload route", () => {
  const originalWindow = globalThis.window;
  const localStorage = createStorage();
  globalThis.window = {
    location: {
      pathname: "/handwriting-to-text",
      search: "?utm_source=yandex&utm_campaign=handwriting&yclid=123&intent=notes"
    },
    localStorage
  };

  try {
    const captured = captureAcquisitionContext("handwriting");
    assert.equal(captured.utm_source, "yandex");
    assert.equal(captured.utm_campaign, "handwriting");
    assert.equal(captured.yclid, "123");
    assert.equal(captured.intent, "notes");
    assert.equal(captured.landing_path, "/handwriting-to-text?utm_source=yandex&utm_campaign=handwriting&yclid=123&intent=notes");

    globalThis.window.location = { pathname: "/", search: "" };
    assert.deepEqual(getAcquisitionContext(), captured);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("uses all three real photo-to-result examples instead of the placeholder", () => {
  const exampleFiles = [
    "marketplace-plan-photo.png",
    "marketplace-plan-result.png",
    "promotion-photo.png",
    "promotion-result.png",
    "logistics-photo.png",
    "logistics-result.png"
  ];

  assert.match(landingSource, /Реальные примеры/);
  assert.doesNotMatch(landingSource, /Нейтральный пример/);

  exampleFiles.forEach((fileName) => {
    assert.match(landingSource, new RegExp(fileName));
    assert.equal(existsSync(new URL(`../public/handwriting-examples/${fileName}`, import.meta.url)), true);
  });
});

test("tracks the verified cross-device block and CTA with device context", () => {
  const calls = [];
  const track = (goal, params) => calls.push({ goal, params });

  trackCrossDeviceBlockView({ deviceType: "mobile", track });
  trackCrossDeviceCtaClick({ deviceType: "desktop", placement: "cross_device_block", track });

  assert.deepEqual(calls, [
    {
      goal: "cross_device_block_view",
      params: {
        landing: "handwriting_to_text",
        device_type: "mobile"
      }
    },
    {
      goal: "cross_device_cta_click",
      params: {
        landing: "handwriting_to_text",
        device_type: "desktop",
        placement: "cross_device_block",
        destination: "/"
      }
    }
  ]);
  assert.equal(getCrossDeviceBlockViewParams("tablet").device_type, "tablet");
  assert.equal(getCrossDeviceCtaParams({ placement: "cross_device_block" }).destination, "/");
  assert.match(landingSource, /Документы доступны на любом устройстве после входа в тот же аккаунт/);
});

test("shows a readable carousel with equal media canvases, tags and a light scanner", () => {
  assert.match(landingSource, /aria-roledescription="карусель"/);
  assert.match(landingSource, /aria-label="Предыдущий пример"/);
  assert.match(landingSource, /aria-label="Следующий пример"/);
  assert.match(landingSource, /handwriting-example-tags/);
  assert.match(landingSource, /Нажмите на изображение, чтобы увеличить/);
  assert.match(styles, /\.handwriting-showcase__media\s*\{[\s\S]*height: clamp\(400px, 44vw, 520px\)/);
  assert.match(styles, /\.handwriting-showcase__media img\s*\{[\s\S]*width: calc\(100% - 32px\);[\s\S]*height: calc\(100% - 32px\);[\s\S]*object-fit: contain;/);
  assert.match(styles, /\.handwriting-scan-line,[\s\S]*height: 54px;[\s\S]*rgba\(255, 255, 255, 0\.94\)/);
  assert.match(styles, /\.handwriting-showcase__comparison\s*\{[\s\S]*grid-template-columns: 1fr;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
