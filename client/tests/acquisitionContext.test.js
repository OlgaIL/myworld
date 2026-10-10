import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { captureAcquisitionContext, getAcquisitionContext } from "../src/services/analytics.js";

const originalWindow = globalThis.window;
afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function browser() {
  const values = new Map();
  globalThis.window = {
    location: { pathname: "/photo-to-text", search: "" },
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    }
  };
  return window;
}

test("first touch A survives campaign B, a new intent and an untagged visit", () => {
  const page = browser();
  page.location.search = "?utm_source=manual_test&utm_campaign=check_A&utm_content=ad_A";
  const first = captureAcquisitionContext("photo_to_text");
  page.location = { pathname: "/handwriting-to-text", search: "?utm_campaign=check_B&utm_term=new_term" };
  assert.deepEqual(captureAcquisitionContext("handwriting_to_text"), first);
  page.location.search = "";
  assert.deepEqual(captureAcquisitionContext(), first);
  assert.deepEqual(getAcquisitionContext(), first);
  assert.equal(first.utm_campaign, "check_A");
  assert.equal(first.utm_term, undefined);
  assert.equal(first.landing_path, "/photo-to-text?utm_source=manual_test&utm_campaign=check_A&utm_content=ad_A");
});

test("expired first touch can be replaced without mixing old campaign fields", () => {
  const page = browser();
  page.localStorage.setItem("word2you_acquisition_context", JSON.stringify({
    utm_campaign: "expired_A", utm_content: "old_ad", captured_at: new Date(Date.now() - 91 * 86400000).toISOString()
  }));
  page.location.search = "?utm_campaign=check_B";
  const context = captureAcquisitionContext();
  assert.equal(context.utm_campaign, "check_B");
  assert.equal(context.utm_content, undefined);
  assert.ok(Date.parse(context.captured_at) > Date.now() - 1000);
});

test("untagged visit does not prevent later acquisition capture", () => {
  const page = browser();
  assert.deepEqual(captureAcquisitionContext(), {});
  page.location.search = "?utm_campaign=check_A";
  assert.equal(captureAcquisitionContext().utm_campaign, "check_A");
});

test("intent-only landing does not block first tagged source, which then survives B", () => {
  const page = browser();
  const intentOnly = captureAcquisitionContext("handwriting_to_text");
  assert.equal(intentOnly.utm_source, undefined);
  assert.deepEqual(captureAcquisitionContext("other"), intentOnly);
  page.location = { pathname: "/photo-to-text", search: "?utm_source=yandex&utm_campaign=check_A" };
  const firstSource = captureAcquisitionContext("photo_to_text");
  assert.equal(firstSource.utm_source, "yandex");
  assert.equal(firstSource.utm_campaign, "check_A");
  assert.equal(firstSource.intent, "photo_to_text");
  assert.equal(firstSource.landing_path, "/photo-to-text?utm_source=yandex&utm_campaign=check_A");
  page.location.search = "?utm_campaign=check_B";
  assert.deepEqual(captureAcquisitionContext(), firstSource);
});
