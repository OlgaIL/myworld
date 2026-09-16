import assert from "node:assert/strict";
import test from "node:test";
import { getVisiblePaymentPackages } from "../src/config/paymentPackages.js";
import { getPackageOfferCopy, getProcessingPackageOffer } from "../src/utils/packageOffer.js";

test("offers start at 3, 2, 1 and 0 remaining", () => {
  for (const remaining of [3, 2, 1, 0]) {
    const offer = getProcessingPackageOffer({
      id: 1,
      freeRemaining: remaining,
      paidRemaining: 0,
      totalRemaining: remaining,
      startPackageUsed: false
    });

    assert.equal(offer.id, "start");
    assert.equal(offer.price, 99);
    assert.equal(offer.remaining, remaining);
    assert.equal(offer.trigger, remaining === 0 ? "limit_reached" : "remaining_low");
    assert.ok(getPackageOfferCopy(offer).title);
  }
});

test("offers mini when the start package was used and the paid balance is low", () => {
  const offer = getProcessingPackageOffer({
    id: 1,
    freeRemaining: 0,
    paidRemaining: 2,
    totalRemaining: 2,
    startPackageUsed: true
  });

  assert.equal(offer.id, "mini");
  assert.equal(offer.amount, 50);
  assert.equal(offer.price, 290);
  assert.equal(offer.trigger, "remaining_low");
  assert.deepEqual(getVisiblePaymentPackages({ startPackageUsed: true }).map((item) => item.id), [
    "mini",
    "standard",
    "maxi"
  ]);
});

test("does not show a package offer while more than three treatments remain", () => {
  for (const remaining of [4, 10]) {
    assert.equal(getProcessingPackageOffer({ totalRemaining: remaining }), null);
  }
});

test("always returns an offer when all processing access is exhausted", () => {
  const offer = getProcessingPackageOffer({
    id: 1,
    freeRemaining: 0,
    paidRemaining: 0,
    totalRemaining: 0,
    startPackageUsed: false
  });

  assert.equal(offer.trigger, "limit_reached");
  assert.equal(offer.id, "start");
  assert.match(getPackageOfferCopy(offer).text, /20 обработок за 99 ₽/);
});
