import assert from "node:assert/strict";
import test from "node:test";
import {
  trackGuestAccountCtaClick,
  trackGuestAccountCtaView
} from "../src/utils/guestAccountCtaAnalytics.js";

test("keeps the old and new guest CTA view events with stable deduplication keys", () => {
  const delivered = [];
  const seen = new Set();
  const trackOnce = (goal, key, params) => {
    const storageKey = `${goal}:${key}`;
    if (!seen.has(storageKey)) {
      seen.add(storageKey);
      delivered.push({ goal, key, params });
    }
  };
  const input = {
    documentId: "guest-42",
    documentStatus: "processed",
    trackOnce
  };

  trackGuestAccountCtaView(input);
  trackGuestAccountCtaView(input);

  assert.deepEqual(delivered.map((item) => item.goal), [
    "guest_save_cta_view",
    "guest_account_cta_view"
  ]);
  assert.equal(delivered[1].params.free_limit, 10);
  assert.equal(delivered[1].params.placement, "document_after_result");
  assert.equal(delivered[1].params.route, "guest_document");
  assert.equal("provider" in delivered[1].params, false);
});

test("tracks the new guest CTA click without personal data", () => {
  const calls = [];

  trackGuestAccountCtaClick({
    provider: "yandex",
    track: (goal, params) => calls.push({ goal, params })
  });

  assert.deepEqual(calls, [{
    goal: "guest_account_cta_click",
    params: {
      placement: "document_after_result",
      route: "guest_document",
      provider: "yandex",
      free_limit: 10
    }
  }]);
});
