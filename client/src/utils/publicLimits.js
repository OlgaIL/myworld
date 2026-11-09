export function normalizePublicLimits(value) {
  const count = number => Number.isSafeInteger(number) && number >= 0 ? number : null;
  return { guestDocumentLimit: count(value?.guestDocumentLimit), freeProcessingLimit: count(value?.freeProcessingLimit) };
}

export function processingCountText(count) {
  if (!Number.isSafeInteger(count) || count < 0) return "Обработки";
  const last = count % 10;
  const teen = count % 100;
  const noun = teen >= 11 && teen <= 14 ? "обработок" : last === 1 ? "обработка"
    : last >= 2 && last <= 4 ? "обработки" : "обработок";
  return `${count} ${noun}`;
}

export function guestAllowanceText(count) {
  return count == null ? "Обработка без регистрации" : `${processingCountText(count)} без регистрации`;
}

export function freeSignupText(count) {
  return count == null ? "Бесплатные обработки после входа" : `${processingCountText(count)} бесплатно после входа`;
}
