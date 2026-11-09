export const BATCH_UPLOAD_PATH = "/?intent=batch";
export const BATCH_TRIAL_PATH = "/?intent=batch-trial";
const STORAGE_KEY = "word2you_pending_batch_upload";
const LIFETIME_MS = 30 * 60 * 1000;
const PLACEMENTS = new Set(["batch_hero", "batch_final", "batch_trial_result", "batch_entry"]);

function normalizeContext(context = {}) {
  return {
    source: context.source === "batch_trial" ? "batch_trial" : "batch_promo",
    placement: PLACEMENTS.has(context.placement) ? context.placement : "batch_entry"
  };
}

export function batchUploadPath(placement) {
  return `${BATCH_UPLOAD_PATH}&placement=${normalizeContext({ placement }).placement}`;
}

export function getBatchRouteContext(search) {
  const params = new URLSearchParams(search);
  if (params.get("intent") !== "batch") return null;
  const placement = params.get("placement");
  return normalizeContext({ placement, source: placement === "batch_trial_result" ? "batch_trial" : "batch_promo" });
}

export function hasBatchTrial(search) {
  return new URLSearchParams(search).get("intent") === "batch-trial";
}

export function clearPendingBatchUpload() {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage is optional. */ }
}

export function rememberPendingBatchUpload(context) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...normalizeContext(context), requestedAt: Date.now() }));
  } catch { /* Email login can still use the current internal route. */ }
}

export function getPendingBatchUpload() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY));
    const age = Date.now() - value?.requestedAt;
    if (value && age >= 0 && age < LIFETIME_MS) return normalizeContext(value);
  } catch { /* Invalid or unavailable storage cannot authorize a return. */ }
  clearPendingBatchUpload();
  return null;
}

// Consume before rendering the next step. No stored return URL is accepted.
export function consumePendingBatchUpload() {
  const context = getPendingBatchUpload();
  clearPendingBatchUpload();
  return context;
}
