export function trackGuestAccountCtaView({
  documentId,
  documentStatus,
  trackOnce
}) {
  trackOnce("guest_save_cta_view", documentId, {
    placement: "document_before_text",
    document_status: documentStatus
  });
  trackOnce("guest_account_cta_view", documentId, {
    placement: "document_before_text",
    free_limit: 10,
    document_status: documentStatus
  });
}

export function trackGuestAccountCtaClick({ provider, track }) {
  track("guest_account_cta_click", {
    placement: "document_before_text",
    provider,
    free_limit: 10
  });
}
