export function trackGuestAccountCtaView({
  documentId,
  documentStatus,
  freeLimit,
  placement = "document_after_result",
  route = "guest_document",
  trackOnce
}) {
  trackOnce("guest_save_cta_view", documentId, {
    placement,
    route,
    document_status: documentStatus
  });
  trackOnce("guest_account_cta_view", documentId, {
    placement,
    route,
    ...(Number.isSafeInteger(freeLimit) ? { free_limit: freeLimit } : {}),
    document_status: documentStatus
  });
}

export function trackGuestAccountCtaClick({ provider, freeLimit, placement = "document_after_result", route = "guest_document", track }) {
  track("guest_account_cta_click", {
    placement,
    route,
    provider,
    ...(Number.isSafeInteger(freeLimit) ? { free_limit: freeLimit } : {})
  });
}
