const PENDING_GUEST_RESULT_KEY = "word2you_pending_guest_result";

export function rememberPendingGuestResult(documentId) {
  try {
    window.sessionStorage.setItem(PENDING_GUEST_RESULT_KEY, documentId);
  } catch {
    // Authentication must continue when session storage is unavailable.
  }
}

export function getPendingGuestResult() {
  try {
    return window.sessionStorage.getItem(PENDING_GUEST_RESULT_KEY) || "";
  } catch {
    return "";
  }
}

export function clearPendingGuestResult() {
  try {
    window.sessionStorage.removeItem(PENDING_GUEST_RESULT_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
