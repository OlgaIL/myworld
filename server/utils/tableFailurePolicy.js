import { analyzeTableFailure } from "./tableFailureAnalysis.js";

export function tableFailurePolicy(status, code, context = null) {
  const { retryable, kind } = analyzeTableFailure(status, code, context, {pageInventory:process.env.TABLE_PAGE_INVENTORY_ENABLED === "true"});
  return { retryable, kind };
}

export function providerRetryAfter(error, now = Date.now()) {
  const header = error?.headers?.get?.("retry-after") ?? error?.headers?.["retry-after"];
  const seconds = Number(header);
  const timestamp = header && !Number.isFinite(seconds) ? Date.parse(header) : NaN;
  const delay = header && Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
    : Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 60000;
  return new Date(now + Math.min(delay, 24 * 60 * 60 * 1000)).toISOString();
}
