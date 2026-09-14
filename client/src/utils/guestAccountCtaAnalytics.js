export function trackGuestAccountCtaView({
  documentId,
  documentStatus,
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
    free_limit: 10,
    document_status: documentStatus
  });
}

export function trackGuestAccountCtaClick({ provider, placement = "document_after_result", route = "guest_document", track }) {
  track("guest_account_cta_click", {
    placement,
    route,
    provider,
    free_limit: 10
  });
}
