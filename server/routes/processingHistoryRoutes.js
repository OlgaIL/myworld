import { Router } from "express";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { listProcessingCreditEventsForUser } from "../repositories/paymentsRepository.js";

const router = Router();

function getSourceLabel(source) {
  if (source === "yookassa") {
    return "Оплачен пакет";
  }

  if (source === "manual") {
    return "Начислен пакет";
  }

  return "Пакет";
}

function mapCreditEvent(event, paidUsedRemaining, fallbackCreatedAt = null) {
  const amount = Number(event.amount || 0);
  const used = Math.min(amount, Math.max(paidUsedRemaining.value, 0));
  paidUsedRemaining.value = Math.max(paidUsedRemaining.value - used, 0);

  return {
    id: String(event.id),
    type: event.source || "package",
    title: `${getSourceLabel(event.source)} ${amount}`,
    packageTitle: event.package_title || "",
    packageId: event.package_id || "",
    amount,
    used,
    remaining: Math.max(amount - used, 0),
    createdAt: event.created_at || fallbackCreatedAt,
    note: event.note || "",
    amountValue: event.amount_value,
    currency: event.currency || "RUB"
  };
}

router.get("/api/processing-history", requireAuthenticatedUser, async (req, res) => {
  try {
    const recordsProcessedTotal = Number(req.user.recordsProcessedTotal || 0);
    const processingQuota = Number(req.user.processingQuota || 0);
    const processingUsed = Number(req.user.processingUsed || 0);
    const freeAmount = Number(req.user.freeProcessingLimit || 0);
    const freeUsed = Math.min(recordsProcessedTotal, freeAmount);
    const creditEvents = await listProcessingCreditEventsForUser(req.user.id);
    const creditedAmount = creditEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0);
    const legacyAmount = Math.max(processingQuota - creditedAmount, 0);
    const paidUsedRemaining = { value: processingUsed };
    const history = [
      {
        id: "free",
        type: "free",
        title: `Бесплатные обработки ${freeAmount}`,
        amount: freeAmount,
        used: freeUsed,
        remaining: Math.max(freeAmount - freeUsed, 0),
        createdAt: req.user.createdAt || null
      }
    ];

    if (legacyAmount > 0) {
      const legacyUsed = Math.min(legacyAmount, Math.max(paidUsedRemaining.value, 0));
      paidUsedRemaining.value = Math.max(paidUsedRemaining.value - legacyUsed, 0);
      history.push({
        id: "legacy",
        type: "legacy",
        title: `Ранее начисленные обработки ${legacyAmount}`,
        amount: legacyAmount,
        used: legacyUsed,
        remaining: Math.max(legacyAmount - legacyUsed, 0),
        createdAt: req.user.createdAt || null
      });
    }

    history.push(...creditEvents.map((event) => mapCreditEvent(event, paidUsedRemaining, req.user.createdAt)));

    return res.json(history.reverse());
  } catch (error) {
    console.error("Processing history load failed:", error);
    return res.status(500).json({ error: "PROCESSING_HISTORY_LOAD_FAILED" });
  }
});

export default router;
