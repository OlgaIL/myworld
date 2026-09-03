import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { getPaymentPackage } from "../config/paymentPackages.js";
import { closeDatabaseConnection, query } from "../db/index.js";
import {
  createPayment,
  findActivePaymentByPackage,
  hasSuccessfulPackagePayment,
  markPaymentSucceededAndCredit,
  updatePaymentProviderData
} from "../repositories/paymentsRepository.js";

const testId = crypto.randomUUID();
let userId;

before(async () => {
  const user = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`payment-package-${testId}@example.test`, "Payment package test"]
  );
  userId = user.rows[0].id;
});

after(async () => {
  if (userId) {
    await query("delete from users where id = $1", [userId]);
  }
  await closeDatabaseConnection();
});

test("uses the server catalog instead of client-provided price or amount", () => {
  const paymentPackage = getPaymentPackage({
    packageId: "start",
    packageTitle: "Макси",
    price: 1,
    amount: 9999
  });

  assert.deepEqual(
    {
      id: paymentPackage.id,
      title: paymentPackage.title,
      amount: paymentPackage.amount,
      price: paymentPackage.price,
      oneTime: paymentPackage.oneTime
    },
    { id: "start", title: "Старт", amount: 20, price: 99, oneTime: true }
  );
  assert.equal(getPaymentPackage({ packageTitle: "Мини" }).id, "mini");
});

test("credits start exactly once and marks it as used", async () => {
  const paymentPackage = getPaymentPackage({ packageId: "start" });
  const payment = await createPayment({
    userId,
    idempotenceKey: `start-${testId}`,
    packageId: paymentPackage.id,
    packageTitle: paymentPackage.title,
    packageAmount: paymentPackage.amount,
    amountValue: paymentPackage.price
  });
  const providerPaymentId = `provider-start-${testId}`;

  await updatePaymentProviderData(payment.id, {
    providerPaymentId,
    status: "pending",
    confirmationUrl: "https://example.test/pay",
    rawPayload: { id: providerPaymentId, status: "pending" }
  });

  const firstResult = await markPaymentSucceededAndCredit(providerPaymentId, { status: "succeeded" });
  const secondResult = await markPaymentSucceededAndCredit(providerPaymentId, { status: "succeeded" });
  const user = (await query("select * from users where id = $1", [userId])).rows[0];

  assert.equal(firstResult.credited, true);
  assert.equal(secondResult.credited, false);
  assert.equal(user.processing_quota, 20);
  assert.equal(await hasSuccessfulPackagePayment(userId, "start"), true);
  assert.equal((await findActivePaymentByPackage(userId, "start")).status, "succeeded");
});

test("keeps existing packages available after start", () => {
  assert.deepEqual(
    ["mini", "standard", "maxi"].map((id) => {
      const item = getPaymentPackage({ packageId: id });
      return [item.id, item.amount, item.price];
    }),
    [
      ["mini", 50, 290],
      ["standard", 150, 590],
      ["maxi", 500, 1490]
    ]
  );
});
