import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trackGoal, trackGoalOnce } from "../services/analytics";
import { createYookassaPayment } from "../services/api";
import { getPackageOfferCopy, getProcessingPackageOffer } from "../utils/packageOffer";
import { getSafePaymentErrorCode } from "../utils/paymentError";

function ProcessingPackageOffer({ user, reloadUser }) {
  const navigate = useNavigate();
  const offer = getProcessingPackageOffer(user);
  const copy = getPackageOfferCopy(offer);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const offerId = offer?.id;
  const offerTrigger = offer?.trigger;
  const offerRemaining = offer?.remaining;
  const offerPrice = offer?.price;

  useEffect(() => {
    if (!offerId) {
      return;
    }

    trackGoalOnce(
      "package_offer_view",
      `${user.id}:${offerId}:${offerTrigger}:${offerRemaining}`,
      {
        trigger: offerTrigger,
        remaining: offerRemaining,
        package_id: offerId,
        package_price: offerPrice
      }
    );
  }, [offerId, offerPrice, offerRemaining, offerTrigger, user?.id]);

  useEffect(() => {
    if (offerRemaining === 0 && user?.id) {
      trackGoalOnce("free_limit_reached", user.id, {
        records_processed: Number(user.recordsProcessedTotal || user.recordsUsed || 0),
        remaining: 0
      });
    }
  }, [offerRemaining, user]);

  if (!offer || !copy) {
    return null;
  }

  const analyticsParams = {
    trigger: offer.trigger,
    remaining: offer.remaining,
    package_id: offer.id,
    package_price: offer.price
  };

  async function purchasePackage() {
    try {
      setSubmitting(true);
      setErrorMessage("");
      trackGoal("package_offer_click", analyticsParams);
      trackGoal("package_select", { ...analyticsParams, source: "processing_package_offer" });
      trackGoal("payment_start", { ...analyticsParams, source: "processing_package_offer" });
      const payment = await createYookassaPayment({ packageId: offer.id });

      if (payment?.credited) {
        trackGoalOnce("payment_success", payment.paymentId, analyticsParams);
        await reloadUser();
        navigate("/account");
        return;
      }

      if (payment?.confirmationUrl) {
        trackGoal("payment_redirect", analyticsParams);
        window.location.href = payment.confirmationUrl;
        return;
      }

      throw new Error("PAYMENT_CONFIRMATION_URL_MISSING");
    } catch (error) {
      const errorCode = getSafePaymentErrorCode(error);
      trackGoal("payment_error", { ...analyticsParams, error_code: errorCode });

      if (errorCode === "START_PACKAGE_ALREADY_USED") {
        await reloadUser();
        setErrorMessage("Стартовый пакет уже использован. Доступен пакет «Мини».");
      } else if (errorCode === "START_PACKAGE_PAYMENT_IN_PROGRESS") {
        setErrorMessage("Оплата стартового пакета уже начата. Откройте страницу пакетов и продолжите оплату.");
      } else {
        setErrorMessage("Не удалось перейти к оплате. Попробуйте ещё раз.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="processing-package-offer" aria-live="polite">
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.text}</p>
      </div>
      <div className="processing-package-offer__actions">
        <button type="button" onClick={purchasePackage} disabled={submitting}>
          {submitting ? "Переходим к оплате..." : copy.action}
        </button>
        {offer.remaining === 0 && <Link to="/packages">Посмотреть все пакеты</Link>}
      </div>
      {errorMessage && <p className="processing-package-offer__error">{errorMessage}</p>}
    </section>
  );
}

export default ProcessingPackageOffer;
