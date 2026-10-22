export const DEFAULT_USER_FILTERS = { search: "", payment: "all", registered: "all", from: "", to: "", activity: "all", sort: "newest", page: 1 };

export function userRemaining(user) {
  if (user.processingEnabled || (user.accessExpiresAt && new Date(user.accessExpiresAt) > new Date())) return "Без ограничений";
  return Math.max(0, Number(user.recordLimit || 0) - Number(user.recordsProcessedTotal || 0))
    + Math.max(0, Number(user.giftProcessingQuota || 0) - Number(user.giftProcessingUsed || 0))
    + Math.max(0, Number(user.processingQuota || 0) - Number(user.processingUsed || 0));
}

export function userRowHighlights(user, now = new Date()) {
  const day = value => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  return { today: Boolean(user.createdAt) && day(user.createdAt) === day(now), paid: user.hasSuccessfulPurchase === true };
}

export function userProcessingUsage(user) {
  if (user.processingEnabled) return "безлимит";
  const free = Math.max(Number(user.recordLimit || 0), 0);
  const quota = Math.max(Number(user.processingQuota || 0), 0);
  const parts = [];
  if (free > 0) parts.push(`бесплатно ${Math.min(Math.max(Number(user.recordsProcessedTotal || 0), 0), free)} из ${free}`);
  if (Number(user.giftProcessingQuota || 0) > 0) parts.push(`подарок ${Number(user.giftProcessingUsed || 0)} из ${Number(user.giftProcessingQuota)}`);
  if (quota > 0) parts.push(`платный пакет ${Math.min(Math.max(Number(user.processingUsed || 0), 0), quota)} из ${quota}`);
  return parts.join(" · ") || "лимит не задан";
}
