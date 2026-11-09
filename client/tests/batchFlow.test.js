import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  BATCH_TRIAL_PATH, batchUploadPath, clearPendingBatchUpload, consumePendingBatchUpload,
  getBatchRouteContext, getPendingBatchUpload, hasBatchTrial, rememberPendingBatchUpload
} from "../src/utils/batchFlow.js";
import { captureAcquisitionContext, getAcquisitionContext, getStoredMetrikaClientId, rememberMetrikaClientId } from "../src/services/analytics.js";
import { hasTableIntent } from "../src/utils/tableFlow.js";

const originalWindow = globalThis.window;
afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function browser() {
  globalThis.window = { sessionStorage: storage(), localStorage: storage(), location: { pathname: "/batch-photo-to-text", search: "" } };
  return window;
}

test("only explicit batch routes activate the flow; the guest and table routes stay distinct", () => {
  assert.deepEqual(getBatchRouteContext("?intent=batch&placement=batch_final"), { source: "batch_promo", placement: "batch_final" });
  assert.deepEqual(getBatchRouteContext("?intent=batch&placement=batch_trial_result"), { source: "batch_trial", placement: "batch_trial_result" });
  for (const search of ["", "?intent=tables", "?view=tables", "?intent=batch-trial"]) assert.equal(getBatchRouteContext(search), null);
  assert.equal(hasBatchTrial(new URL(BATCH_TRIAL_PATH, "http://localhost").search), true);
  assert.equal(hasTableIntent("?intent=batch"), false);
  assert.equal(hasTableIntent("?intent=tables"), true);
});

test("return paths and placements cannot inject an external redirect or arbitrary analytics data", () => {
  const path = batchUploadPath("https://example.invalid/private");
  assert.equal(path, "/?intent=batch&placement=batch_entry");
  assert.deepEqual(getBatchRouteContext("?intent=batch&placement=email@example.invalid&returnTo=https://example.invalid"), { source: "batch_promo", placement: "batch_entry" });
});

test("OAuth-like reload preserves and consumes source and placement exactly once", () => {
  const page = browser();
  rememberPendingBatchUpload({ source: "batch_promo", placement: "batch_hero" });
  page.location = { pathname: "/", search: "" };
  assert.deepEqual(consumePendingBatchUpload(), { source: "batch_promo", placement: "batch_hero" });
  assert.equal(consumePendingBatchUpload(), null);
  assert.equal(getPendingBatchUpload(), null);
});

test("cancelled login and an unrelated later login cannot reuse the intent", () => {
  browser();
  rememberPendingBatchUpload({ source: "batch_trial", placement: "batch_trial_result" });
  clearPendingBatchUpload();
  assert.equal(consumePendingBatchUpload(), null);
  rememberPendingBatchUpload({ placement: "batch_final" });
  assert.equal(consumePendingBatchUpload().placement, "batch_final");
  assert.equal(consumePendingBatchUpload(), null);
});

test("stale, malformed and future-dated intents expire without a return", () => {
  browser();
  for (const value of ["broken", "null", JSON.stringify({ requestedAt: Date.now() - 31 * 60000 }), JSON.stringify({ requestedAt: Date.now() + 60000 })]) {
    window.sessionStorage.setItem("word2you_pending_batch_upload", value);
    assert.equal(consumePendingBatchUpload(), null);
  }
});

test("restricted storage fails closed and leaves normal authentication available", () => {
  browser();
  window.sessionStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); }, removeItem() { throw Error("blocked"); } };
  assert.doesNotThrow(() => rememberPendingBatchUpload({}));
  assert.equal(consumePendingBatchUpload(), null);
});

test("batch handoff does not replace UTM, yclid, first touch or ClientID", () => {
  const page = browser();
  page.location.search = "?utm_source=yandex&utm_campaign=batch&utm_content=synthetic_ad&yclid=synthetic_click";
  const firstTouch = captureAcquisitionContext("batch_photo_to_text");
  rememberMetrikaClientId("123456789");
  page.location = { pathname: "/", search: "?intent=batch&placement=batch_hero" };
  rememberPendingBatchUpload(getBatchRouteContext(page.location.search));
  captureAcquisitionContext();
  page.location = { pathname: "/", search: "" };
  consumePendingBatchUpload();
  assert.deepEqual(getAcquisitionContext(), firstTouch);
  assert.equal(getStoredMetrikaClientId(), "123456789");
});
