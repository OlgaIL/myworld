import assert from "node:assert/strict";
import test from "node:test";
import { getVisiblePaymentPackages } from "../src/config/paymentPackages.js";
import { getPackageOfferCopy, getProcessingPackageOffer } from "../src/utils/packageOffer.js";

test("offers start only at a real zero balance", () => {
  const offer = getProcessingPackageOffer({
    id: 1,
    freeRemaining: 0,
    paidRemaining: 0,
    totalRemaining: 0,
    startPackageUsed: false
  });

  assert.equal(offer.id, "start");
  assert.equal(offer.price, 99);
  assert.equal(offer.remaining, 0);
  assert.equal(offer.trigger, "limit_reached");
  assert.ok(getPackageOfferCopy(offer).title);
});

test("does not offer a package while a paid balance remains", () => {
  const offer = getProcessingPackageOffer({
    id: 1,
    freeRemaining: 0,
    paidRemaining: 2,
    totalRemaining: 2,
    startPackageUsed: true
  });

  assert.equal(offer, null);
  assert.deepEqual(getVisiblePaymentPackages({ startPackageUsed: true }).map((item) => item.id), [
    "mini",
    "standard",
    "maxi"
  ]);
});

test("does not show a package offer at any non-zero balance", () => {
  for (const remaining of [1, 2, 3, 4, 10]) {
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
