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

test("offers mini after start has been used", () => {
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
  assert.deepEqual(getVisiblePaymentPackages({ startPackageUsed: true }).map((item) => item.id), [
    "mini",
    "standard",
    "maxi"
  ]);
});

test("does not show a package offer while more than three treatments remain", () => {
  assert.equal(getProcessingPackageOffer({ totalRemaining: 4 }), null);
});
