import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DocumentPage from "./DocumentPage";
import GuestHome from "./GuestHome";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { useGuestDocumentPageData } from "../hooks/useGuestDocumentPageData";
import { useGuestUpload } from "../hooks/useGuestUpload";
import { rememberPendingGuestResult } from "../utils/guestResultHandoff";

function GuestExperience({
  documents,
  access,
  loading,
  addDocument,
  retryDocument,
  setCorrectionApplied,
  authProviders,
  onProviderLogin,
  onOpenImage,
  onRequestImprovement
}) {
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [scrollTargetDocumentId, setScrollTargetDocumentId] = useState(null);
  const [retryingDocument, setRetryingDocument] = useState(false);
  const [retryProcessingError, setRetryProcessingError] = useState("");
  const [updatingCorrectionId, setUpdatingCorrectionId] = useState("");
  const [correctionError, setCorrectionError] = useState("");
  const fileInputRef = useRef(null);
  const { copiedMap, copyText, resetCopied } = useCopyFeedback();
  const activeDocument = useMemo(
    () => documents.find((document) => String(document.id) === String(activeDocumentId)) || null,
    [activeDocumentId, documents]
  );
  const { photo, info } = useGuestDocumentPageData(activeDocument);
  const uploadAllowed = access?.uploadAllowed !== false;
  const limitMessage = "Гостевая загрузка без входа уже использована. Чтобы загрузить новую запись, войдите в кабинет.";

  const handleUploadStart = useCallback(() => {
    setActiveDocumentId(null);
    setScrollTargetDocumentId(null);
  }, []);

  const handleUploadSuccess = useCallback((document) => {
    if (document?.id) {
      setScrollTargetDocumentId(document.id);
    }
  }, []);

  const {
    uploading,
    uploadMessage,
    error,
    replacingDocumentId,
    openUpload,
    handleUpload
  } = useGuestUpload({
    uploadAllowed,
    limitMessage,
    addGuestDocument: addDocument,
    onUploadStart: handleUploadStart,
    onUploadSuccess: handleUploadSuccess,
    fileInputRef
  });

  useEffect(() => {
    setRetryProcessingError("");
    setCorrectionError("");
    setUpdatingCorrectionId("");
    resetCopied();
  }, [activeDocumentId, resetCopied]);

  function openDocument(document) {
    setActiveDocumentId(document.id);
  }

  function closeDocument() {
    setActiveDocumentId(null);
  }

  function requestDocumentLogin(providerId) {
    const guestResultId = activeDocument?.filename || activeDocument?.id || "";
    if (guestResultId) {
      rememberPendingGuestResult(guestResultId);
    }
    onProviderLogin(providerId, { placement: "document_after_result", source: "guest_result_cta" });
  }

  async function handleProcessingRetry() {
    if (!activeDocument?.id || retryingDocument) return;
    setRetryingDocument(true);
    setRetryProcessingError("");
    try {
      await retryDocument(activeDocument.id);
    } catch (retryError) {
      setRetryProcessingError(retryError.message || "Не удалось повторить обработку. Попробуйте позже.");
    } finally {
      setRetryingDocument(false);
    }
  }

  async function handleCorrectionToggle(correction) {
    if (!activeDocument?.id || updatingCorrectionId) return;
    setUpdatingCorrectionId(correction.id);
    setCorrectionError("");

    try {
      await setCorrectionApplied(activeDocument.id, correction.id, !correction.applied);
    } catch (updateError) {
      setCorrectionError(updateError.message || "Не удалось изменить замену. Попробуйте позже.");
    } finally {
      setUpdatingCorrectionId("");
    }
  }

  return (
    <>
      {activeDocument ? (
        <DocumentPage
          photo={photo}
          info={info}
          copiedMap={copiedMap}
          onBack={closeDocument}
          onOpenImage={onOpenImage}
          onCopy={copyText}
          authProviders={authProviders}
          onProviderLogin={requestDocumentLogin}
          improvementRequest={activeDocument.improvementRequest || null}
          onRequestImprovement={() => onRequestImprovement(activeDocument)}
          onRetryProcessing={handleProcessingRetry}
          retryProcessing={retryingDocument}
          retryProcessingError={retryProcessingError}
          onToggleCorrection={handleCorrectionToggle}
          updatingCorrectionId={updatingCorrectionId}
          correctionError={correctionError}
        />
      ) : (
        <GuestHome
          documents={documents}
          access={access}
          loading={loading}
          uploading={uploading}
          uploadMessage={uploadMessage}
          error={error}
          replacingDocumentId={replacingDocumentId}
          scrollTargetDocumentId={scrollTargetDocumentId}
          onScrollTargetHandled={() => setScrollTargetDocumentId(null)}
          onUpload={openUpload}
          onOpenImage={onOpenImage}
          onOpenDocument={openDocument}
          onUploadAnother={openUpload}
          onProviderLogin={onProviderLogin}
          authProviders={authProviders}
        />
      )}

      <input
        ref={fileInputRef}
        className="upload-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleUpload}
        disabled={uploading || !uploadAllowed}
      />
    </>
  );
}

export default GuestExperience;
