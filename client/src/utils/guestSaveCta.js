export function canShowGuestDocumentSaveCta({
  isAuthenticated,
  documentStatus,
  recognizedText,
  providers,
  onProviderLogin
}) {
  const isReadyDocument = documentStatus === "processed" || documentStatus === "claimed";

  return !isAuthenticated
    && isReadyDocument
    && Boolean(String(recognizedText || "").trim())
    && Array.isArray(providers)
    && providers.length > 0
    && typeof onProviderLogin === "function";
}
