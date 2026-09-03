import { randomUUID } from "crypto";
import { Router } from "express";
import { YOOKASSA_ENABLED, YOOKASSA_MOCK_SUCCESS, YOOKASSA_RETURN_URL } from "../config/env.js";
import { YOOKASSA_SECRET_KEY, YOOKASSA_SHOP_ID } from "../config/private-env.js";
import { getPaymentPackage } from "../config/paymentPackages.js";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import {
  createPayment,
  findActivePaymentByPackage,
  hasSuccessfulPackagePayment,
  markPaymentCanceled,
  markPaymentFailedById,
  markPaymentSucceededAndCredit,
  updatePaymentProviderData
} from "../repositories/paymentsRepository.js";
import { createYookassaPayment, getYookassaPayment } from "../services/yookassaService.js";

const router = Router();

function isYookassaConfigured() {
  return Boolean(YOOKASSA_ENABLED && YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY);
}

function isLocalMockEnabled(req) {
  const hostname = String(req.hostname || "").toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  return YOOKASSA_MOCK_SUCCESS && isLocalhost;
}

function getReturnUrl() {
  return YOOKASSA_RETURN_URL || "/";
}

router.post("/api/payments/yookassa", requireAuthenticatedUser, async (req, res) => {
  try {
    const mockEnabled = isLocalMockEnabled(req);

    console.log("[payment] yookassa request", {
      userId: req.user?.id,
      packageId: req.body?.packageId,
      packageTitle: req.body?.packageTitle,
      mockEnabled,
      yookassaEnabled: YOOKASSA_ENABLED
    });

    if (!mockEnabled && !isYookassaConfigured()) {
      return res.status(503).json({ error: "YOOKASSA_DISABLED" });
    }

    const paymentPackage = getPaymentPackage(req.body);

    if (!paymentPackage) {
      return res.status(400).json({ error: "UNKNOWN_PACKAGE" });
    }

    if (paymentPackage.oneTime) {
      const activePayment = await findActivePaymentByPackage(req.user.id, paymentPackage.id);

      if (activePayment?.status === "succeeded") {
        return res.status(409).json({ error: "START_PACKAGE_ALREADY_USED" });
      }

      if (activePayment?.confirmation_url) {
        return res.json({
          confirmationUrl: activePayment.confirmation_url,
          paymentId: activePayment.provider_payment_id,
          packageId: paymentPackage.id,
          packageTitle: paymentPackage.title
        });
      }

      if (activePayment) {
        return res.status(409).json({ error: "START_PACKAGE_PAYMENT_IN_PROGRESS" });
      }

      if (await hasSuccessfulPackagePayment(req.user.id, paymentPackage.id)) {
        return res.status(409).json({ error: "START_PACKAGE_ALREADY_USED" });
      }
    }

    const idempotenceKey = randomUUID();
    let localPayment;

    try {
      localPayment = await createPayment({
        userId: req.user.id,
        idempotenceKey,
        packageId: paymentPackage.id,
        packageTitle: paymentPackage.title,
        packageAmount: paymentPackage.amount,
        amountValue: paymentPackage.price,
        currency: "RUB"
      });
    } catch (error) {
      if (paymentPackage.oneTime && error?.code === "23505") {
        const activePayment = await findActivePaymentByPackage(req.user.id, paymentPackage.id);
        if (activePayment?.status === "succeeded") {
          return res.status(409).json({ error: "START_PACKAGE_ALREADY_USED" });
        }

        return res.status(409).json({ error: "START_PACKAGE_PAYMENT_IN_PROGRESS" });
      }

      throw error;
    }

    if (mockEnabled) {
      const mockPayment = {
        id: `mock-${localPayment.id}-${Date.now()}`,
        status: "succeeded",
        paid: true,
        amount: {
          value: String(paymentPackage.price),
          currency: "RUB"
        },
        metadata: {
          localPaymentId: String(localPayment.id),
          userId: String(req.user.id),
          packageId: paymentPackage.id,
          packageTitle: paymentPackage.title,
          packageAmount: String(paymentPackage.amount)
        }
      };

      await updatePaymentProviderData(localPayment.id, {
        providerPaymentId: mockPayment.id,
        status: mockPayment.status,
        confirmationUrl: "",
        rawPayload: mockPayment
      });
      const result = await markPaymentSucceededAndCredit(mockPayment.id, mockPayment);

      console.log("[payment] mock credited", {
        userId: req.user.id,
        packageTitle: paymentPackage.title,
        amount: paymentPackage.amount,
        credited: Boolean(result?.credited)
      });

      return res.json({
        credited: Boolean(result?.credited),
        paymentId: mockPayment.id,
        packageId: paymentPackage.id,
        packageTitle: paymentPackage.title
      });
    }

    try {
      const yookassaPayment = await createYookassaPayment({
        shopId: YOOKASSA_SHOP_ID,
        secretKey: YOOKASSA_SECRET_KEY,
        idempotenceKey,
        amountValue: paymentPackage.price,
        currency: "RUB",
        description: `Пакет Word2you «${paymentPackage.title}»`,
        returnUrl: getReturnUrl(),
        metadata: {
          localPaymentId: String(localPayment.id),
          userId: String(req.user.id),
          packageId: paymentPackage.id,
          packageTitle: paymentPackage.title,
          packageAmount: String(paymentPackage.amount)
        }
      });

      const confirmationUrl = yookassaPayment.confirmation?.confirmation_url || "";
      await updatePaymentProviderData(localPayment.id, {
        providerPaymentId: yookassaPayment.id,
        status: yookassaPayment.status || "pending",
        confirmationUrl,
        rawPayload: yookassaPayment
      });

      if (yookassaPayment.status === "succeeded") {
        await markPaymentSucceededAndCredit(yookassaPayment.id, yookassaPayment);
      }

      if (!confirmationUrl) {
        return res.status(502).json({ error: "YOOKASSA_CONFIRMATION_URL_MISSING" });
      }

      return res.json({
        confirmationUrl,
        paymentId: yookassaPayment.id,
        packageId: paymentPackage.id,
        packageTitle: paymentPackage.title
      });
    } catch (error) {
      await markPaymentFailedById(localPayment.id, {
        error: "YOOKASSA_PAYMENT_CREATE_FAILED"
      });
      console.error("YOOKASSA CREATE PAYMENT ERROR:", error.response?.data || error.message);
      return res.status(502).json({ error: "YOOKASSA_PAYMENT_CREATE_FAILED" });
    }
  } catch (error) {
    console.error("PAYMENT ROUTE ERROR:", error);
    return res.status(500).json({ error: "PAYMENT_ROUTE_FAILED", message: error.message });
  }
});

router.post("/api/payments/yookassa/webhook", async (req, res) => {
  if (!isYookassaConfigured()) {
    return res.status(503).json({ error: "YOOKASSA_DISABLED" });
  }

  const event = String(req.body?.event || "");
  const paymentId = req.body?.object?.id;

  if (!event.startsWith("payment.") || !paymentId) {
    return res.json({ ok: true });
  }

  try {
    const payment = await getYookassaPayment({
      shopId: YOOKASSA_SHOP_ID,
      secretKey: YOOKASSA_SECRET_KEY,
      paymentId
    });

    if (payment.status === "succeeded") {
      const result = await markPaymentSucceededAndCredit(payment.id, payment);
      return res.json({ ok: true, credited: Boolean(result?.credited) });
    }

    if (payment.status === "canceled") {
      await markPaymentCanceled(payment.id, payment);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("YOOKASSA WEBHOOK ERROR:", error.response?.data || error.message);
    return res.status(500).json({ error: "YOOKASSA_WEBHOOK_FAILED" });
  }
});

export default router;
