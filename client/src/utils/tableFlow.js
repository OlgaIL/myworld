import { getTableAttemptState } from "./tableAttemptState.js";

export const TABLE_UPLOAD_PATH = "/?intent=tables";
const TABLE_RESTORE_KEY = "word2you_pending_table_restore";
const INTENT_LIFETIME_MS = 30 * 60 * 1000;

export function hasTableIntent(search) {
  const params = new URLSearchParams(search);
  return params.get("intent") === "tables" || params.get("view") === "tables";
}

export function clearPendingTableRestore() {
  try {
    window.sessionStorage.removeItem(TABLE_RESTORE_KEY);
  } catch {
    // Without reliable storage, the user can still start restoration manually.
  }
}

export function rememberPendingTableRestore(documentId) {
  try {
    window.sessionStorage.setItem(TABLE_RESTORE_KEY, JSON.stringify({ documentId, requestedAt: Date.now() }));
  } catch {
    // Authentication must remain available when storage is restricted.
  }
}

export function getPendingTableRestore() {
  try {
    const intent = JSON.parse(window.sessionStorage.getItem(TABLE_RESTORE_KEY));
    const age = Date.now() - intent?.requestedAt;
    if (typeof intent?.documentId === "string" && intent.documentId && age >= 0 && age < INTENT_LIFETIME_MS) {
      return intent.documentId;
    }
    clearPendingTableRestore();
  } catch {
    clearPendingTableRestore();
  }
  return "";
}

// Remove authorization before the request: remounts, refreshes and failures
// must never turn a single login action into repeated paid model calls.
export function consumePendingTableRestore(documentId) {
  if (!documentId || getPendingTableRestore() !== documentId) return false;
  try {
    window.sessionStorage.removeItem(TABLE_RESTORE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function canAutoRestoreTables({ isAuthenticated, info, tableLocked, enrichmentPending }) {
  const attempts = getTableAttemptState(info);
  return Boolean(isAuthenticated && info?.hasTable && info.status === "processed"
    && !enrichmentPending && !tableLocked
    && (!info.tableStatus || info.tableStatus === "not_started")
    && attempts.used === 0 && !attempts.disabled);
}
