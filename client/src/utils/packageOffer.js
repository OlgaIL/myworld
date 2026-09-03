const OFFER_PACKAGES = {
  start: { id: "start", amount: 20, price: 99 },
  mini: { id: "mini", amount: 50, price: 290 }
};

export function getProcessingPackageOffer(user) {
  if (!user || user.unlimitedAccess || user.processingEnabled || user.extendedAccessActive) {
    return null;
  }

  const freeRemaining = Math.max(Number(user.freeRemaining ?? user.recordsRemaining ?? 0), 0);
  const paidRemaining = Math.max(Number(user.paidRemaining ?? user.packageRemaining ?? 0), 0);
  const totalRemaining = Math.max(Number(user.totalRemaining ?? freeRemaining + paidRemaining), 0);

  if (totalRemaining > 3) {
    return null;
  }

  const paymentPackage = user.startPackageUsed ? OFFER_PACKAGES.mini : OFFER_PACKAGES.start;
  const trigger = totalRemaining === 0 ? "limit_reached" : "remaining_low";
  const balanceKind = paidRemaining > 0 || freeRemaining === 0 ? "paid" : "free";

  return {
    ...paymentPackage,
    trigger,
    remaining: totalRemaining,
    balanceKind
  };
}

export function getPackageOfferCopy(offer) {
  if (!offer) {
    return null;
  }

  const isStart = offer.id === "start";

  if (offer.remaining === 0) {
    return {
      title: isStart ? "Бесплатные обработки закончились" : "Обработки закончились",
      text: `Добавьте ${offer.amount} обработок за ${offer.price} ₽ и продолжайте работу.`,
      action: `Продолжить за ${offer.price} ₽`
    };
  }

  const isFree = offer.balanceKind === "free";
  const title = offer.remaining === 1
    ? `Осталась последняя ${isFree ? "бесплатная " : ""}обработка`
    : `Осталось ${offer.remaining} ${isFree ? "бесплатные " : ""}обработки`;

  return {
    title,
    text: offer.remaining === 1
      ? "Пополните баланс сейчас, чтобы следующая загрузка не остановилась."
      : "Чтобы продолжить работу без перерыва, можно заранее пополнить баланс.",
    action: `Купить ${offer.amount} обработок за ${offer.price} ₽`
  };
}
