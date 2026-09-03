export function getSafePaymentErrorCode(error) {
  const code = String(error?.response?.data?.error || error?.message || "PAYMENT_FAILED");
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : "PAYMENT_FAILED";
}
