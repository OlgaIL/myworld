export function canShowGuestDocumentSaveCta({
  isAuthenticated,
  documentStatus,
  recognizedText,
  providers,
  onProviderLogin
}) {
  const isReadyDocument = ["processed", "recognized", "claimed"].includes(documentStatus);

  return !isAuthenticated
    && isReadyDocument
    && Boolean(String(recognizedText || "").trim())
    && Array.isArray(providers)
    && providers.length > 0
    && typeof onProviderLogin === "function";
}
