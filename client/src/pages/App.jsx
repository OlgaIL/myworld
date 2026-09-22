import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import CabinetHome from "../components/CabinetHome";
import DocumentPage from "../components/DocumentPage";
import GuestExperience from "../components/GuestExperience";
import ImprovementRequestModal from "../components/ImprovementRequestModal";
import LegalAgreementModal from "../components/LegalAgreementModal";
import Modal from "../components/Modal";
import PageFooter from "../components/PageFooter";
import { useAuthContext } from "../contexts/AuthContext";
import { useCabinetFilters } from "../hooks/useCabinetFilters";
import { useCabinetUpload } from "../hooks/useCabinetUpload";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { useGuestDocument } from "../hooks/useGuestDocument";
import { useImprovementRequest } from "../hooks/useImprovementRequest";
import { useImprovementRequests } from "../hooks/useImprovementRequests";
import { useLegalAgreement } from "../hooks/useLegalAgreement";
import { usePhotos } from "../hooks/usePhotos";
import { trackGoal } from "../services/analytics";
import { getPhotoUrl, processPhoto, setPhotoCorrectionApplied } from "../services/api";
import { clearPendingGuestResult, getPendingGuestResult } from "../utils/guestResultHandoff";

const PENDING_IMPROVEMENT_DOCUMENT_KEY = "word2you_pending_improvement_document";

function rememberPendingImprovementDocument(documentId) {
  try {
    window.sessionStorage.setItem(PENDING_IMPROVEMENT_DOCUMENT_KEY, documentId);
  } catch {
    // Login should continue even when session storage is unavailable.
  }
}

function getPendingImprovementDocument() {
  try {
    return window.sessionStorage.getItem(PENDING_IMPROVEMENT_DOCUMENT_KEY) || "";
  } catch {
    return "";
  }
}

function clearPendingImprovementDocument() {
  try {
    window.sessionStorage.removeItem(PENDING_IMPROVEMENT_DOCUMENT_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function App() {
  const navigate = useNavigate();
  const { documentName } = useParams();
  const { user, authProviders, authLoading, loginWithProvider, logout, reloadUser } = useAuthContext();
  const {
    legalAgreementOpen,
    requestLegalAgreement,
    acceptLegalAgreement,
    closeLegalAgreement,
    legalAgreementAccepting
  } = useLegalAgreement({ user, reloadUser });
  const {
    guestDocuments,
    guestAccess,
    guestLoading,
    addGuestDocument,
    retryGuestDocument,
    setGuestCorrectionApplied
  } = useGuestDocument(!user);
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos(Boolean(user), {
    onPhotosChanged: reloadUser
  });
  const [activePhoto, setActivePhoto] = useState(null);
  const [improvementModalMode, setImprovementModalMode] = useState(null);
  const [guestImprovementDocumentId, setGuestImprovementDocumentId] = useState("");
  const [retryingDocument, setRetryingDocument] = useState(false);
  const [retryProcessingError, setRetryProcessingError] = useState("");
  const [updatingCorrectionId, setUpdatingCorrectionId] = useState("");
  const [correctionError, setCorrectionError] = useState("");
  const [showPostAuthNextStep, setShowPostAuthNextStep] = useState(false);
  const { copiedMap: documentCopiedMap, copyText: handleDocumentCopy, resetCopied } = useCopyFeedback();
  const fileInputRef = useRef(null);
  const photosCount = Array.isArray(photos) ? photos.length : 0;
  const recordLimit = Number(user?.recordLimit || 0);
  const recordsUsed = Number(user?.recordsUsed ?? 0);
  const recordUploadAllowed = user?.recordUploadAllowed !== false;
  const {
    uploading: cabinetUploading,
    uploadMessage: cabinetUploadMessage,
    pendingPhotos,
    handleUpload
  } = useCabinetUpload({
    user,
    addPhoto,
    reloadPhotos,
    reloadUser,
    recordUploadAllowed
  });
  const activeDocumentPhoto = user && documentName
    ? photos.find((photo) => photo.name === documentName)
    : null;
  const activeDocumentInfo = activeDocumentPhoto || null;
  const {
    requestsByDocumentId: improvementRequestsByDocumentId,
    upsertRequest: upsertImprovementRequest
  } = useImprovementRequests(Boolean(user));
  const {
    request: improvementRequest,
    loading: improvementRequestLoading,
    submitting: improvementRequestSubmitting,
    error: improvementRequestError,
    submitRequest: submitImprovementRequest
  } = useImprovementRequest(documentName, Boolean(user && documentName), {
    onRequestChanged: upsertImprovementRequest
  });

  useEffect(() => {
    setCorrectionError("");
    setUpdatingCorrectionId("");
  }, [documentName]);
  const {
    searchQuery,
    setSearchQuery,
    browseMode,
    activeCategory,
    activeSection,
    activeTopic,
    activeTag,
    activeYear,
    activeMonth,
    activeDay,
    showTags,
    sectionOptions,
    topicOptions,
    tagOptions,
    yearOptions,
    monthOptions,
    dayOptions,
    filteredPhotos,
    hiddenPhotosCount,
    nextPhotosCount,
    showMorePhotos,
    selectBrowseMode,
    resetCategory,
    selectCategory: applyCategoryFilter,
    resetTopicFilters,
    selectSection,
    selectTopic,
    resetTag,
    selectTag: applyTagFilter,
    resetDateFilters,
    selectYear,
    selectMonth,
    selectDay,
    toggleTags
  } = useCabinetFilters(photos);

  const requestProviderLogin = useCallback((providerId, options = {}) => {
    if (!user && guestDocuments.length > 0) {
      trackGoal("auth_click_after_upload", {
        provider: providerId,
        ...(options.placement ? { placement: options.placement } : {})
      });
    }

    requestLegalAgreement(() => {
      if (options.improvementDocumentId) {
        rememberPendingImprovementDocument(options.improvementDocumentId);
      }
      loginWithProvider(providerId, {
        source: options.source || (options.placement ? "guest_result" : "app_login"),
        placement: options.placement || "app"
      });
    });
  }, [guestDocuments.length, loginWithProvider, requestLegalAgreement, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const pendingDocumentId = getPendingImprovementDocument();
    if (!pendingDocumentId) {
      return;
    }

    if (documentName === pendingDocumentId) {
      clearPendingImprovementDocument();
      const timeoutId = window.setTimeout(() => setImprovementModalMode("request"), 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (photos.some((photo) => photo.name === pendingDocumentId)) {
      navigate(`/documents/${encodeURIComponent(pendingDocumentId)}`);
    }
  }, [documentName, navigate, photos, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const pendingGuestResult = getPendingGuestResult();
    if (!pendingGuestResult) {
      return;
    }

    if (documentName === pendingGuestResult) {
      setShowPostAuthNextStep(true);
      clearPendingGuestResult();
      return;
    }

    if (photos.some((photo) => photo.name === pendingGuestResult)) {
      setShowPostAuthNextStep(true);
      clearPendingGuestResult();
      navigate(`/documents/${encodeURIComponent(pendingGuestResult)}`);
    }
  }, [documentName, navigate, photos, user]);

  const requestCabinetUpload = useCallback(() => {
    requestLegalAgreement(() => fileInputRef.current?.click());
  }, [requestLegalAgreement]);

  const openDocument = useCallback(function openDocument(photo) {
    resetCopied();
    navigate(`/documents/${encodeURIComponent(photo.name)}`);
  }, [navigate, resetCopied]);

  const closeDocument = useCallback(function closeDocument() {
    resetCopied();
    navigate("/");
  }, [navigate, resetCopied]);

  const handlePostAuthProcessAnother = useCallback(() => {
    setShowPostAuthNextStep(false);
    closeDocument();
  }, [closeDocument]);

  const selectCategory = useCallback(function selectCategory(category) {
    applyCategoryFilter(category);
    resetCopied();
    navigate("/");
  }, [applyCategoryFilter, navigate, resetCopied]);

  const selectTag = useCallback(function selectTag(tag) {
    applyTagFilter(tag);
    resetCopied();
    navigate("/");
  }, [applyTagFilter, navigate, resetCopied]);

  function openGuestImprovementRequest(document) {
    if (!document?.filename) {
      return;
    }
    setGuestImprovementDocumentId(document.filename);
    setImprovementModalMode("auth");
  }

  function loginForImprovement(providerId, options = {}) {
    setImprovementModalMode(null);
    requestProviderLogin(providerId, {
      ...options,
      source: "guest_improvement",
      improvementDocumentId: guestImprovementDocumentId
    });
  }

  async function handleImprovementRequestSubmit({ comment }) {
    try {
      const created = await submitImprovementRequest({ comment });
      if (created) {
        setImprovementModalMode(null);
      }
    } catch {
      // The hook keeps the modal open and exposes a user-facing error.
    }
  }

  async function handleCabinetProcessingRetry() {
    if (!activeDocumentPhoto?.name || retryingDocument) return;
    setRetryingDocument(true);
    setRetryProcessingError("");
    try {
      await processPhoto(activeDocumentPhoto.name);
      await Promise.all([reloadPhotos(), reloadUser()]);
    } catch (error) {
      setRetryProcessingError(error.message || "Не удалось повторить обработку. Попробуйте позже.");
    } finally {
      setRetryingDocument(false);
    }
  }

  async function handleCabinetCorrectionToggle(correction) {
    if (!activeDocumentPhoto?.name || updatingCorrectionId) return;
    setUpdatingCorrectionId(correction.id);
    setCorrectionError("");

    try {
      await setPhotoCorrectionApplied(
        activeDocumentPhoto.name,
        correction.id,
        !correction.applied
      );
      await reloadPhotos();
    } catch (error) {
      setCorrectionError(error.message || "Не удалось изменить замену. Попробуйте позже.");
    } finally {
      setUpdatingCorrectionId("");
    }
  }

  if (authLoading) {
    return <div className="page page--centered">Загрузка...</div>;
  }

  return (
    <div className="page">
      <AppHeader
        user={user}
        recordsUsed={recordsUsed}
        recordLimit={recordLimit}
        authProviders={authProviders}
        onProviderLogin={requestProviderLogin}
        onLogout={logout}
        logoLinkEnabled={Boolean(documentName)}
      />

      {!user && (
        <GuestExperience
          documents={guestDocuments}
          access={guestAccess}
          loading={guestLoading}
          addDocument={addGuestDocument}
          retryDocument={retryGuestDocument}
          setCorrectionApplied={setGuestCorrectionApplied}
          authProviders={authProviders}
          onProviderLogin={requestProviderLogin}
          onOpenImage={setActivePhoto}
          onRequestImprovement={openGuestImprovementRequest}
        />
      )}

      {user && (
        <>
          {documentName ? (
            <DocumentPage
              photo={activeDocumentPhoto}
              info={activeDocumentInfo}
              copiedMap={documentCopiedMap}
              onBack={closeDocument}
              onOpenImage={setActivePhoto}
              onCopy={handleDocumentCopy}
              onSelectCategory={selectCategory}
              onSelectTag={selectTag}
              improvementRequest={improvementRequest}
              improvementRequestLoading={improvementRequestLoading}
              improvementRequestError={improvementRequestError}
              onRequestImprovement={() => setImprovementModalMode("request")}
              onRetryProcessing={handleCabinetProcessingRetry}
              retryProcessing={retryingDocument}
              retryProcessingError={retryProcessingError}
              onToggleCorrection={handleCabinetCorrectionToggle}
              updatingCorrectionId={updatingCorrectionId}
              correctionError={correctionError}
              isAuthenticated
              showPostAuthNextStep={showPostAuthNextStep}
              postAuthUserId={user.id}
              postAuthProcessingOrdinal={Number(user.recordsProcessedTotal || user.recordsUsed || 0) + 1}
              onProcessAnother={handlePostAuthProcessAnother}
            />
          ) : (
            <CabinetHome
              user={user}
              recordsUsed={photosCount}
              photosCount={photosCount}
              pendingPhotos={pendingPhotos}
              filteredPhotos={filteredPhotos}
              improvementRequestsByDocumentId={improvementRequestsByDocumentId}
              uploadMessage={cabinetUploadMessage}
              uploading={cabinetUploading}
              recordUploadAllowed={recordUploadAllowed}
              reloadUser={reloadUser}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              browseMode={browseMode}
              activeCategory={activeCategory}
              activeSection={activeSection}
              activeTopic={activeTopic}
              activeTag={activeTag}
              activeYear={activeYear}
              activeMonth={activeMonth}
              activeDay={activeDay}
              showTags={showTags}
              sectionOptions={sectionOptions}
              topicOptions={topicOptions}
              tagOptions={tagOptions}
              yearOptions={yearOptions}
              monthOptions={monthOptions}
              dayOptions={dayOptions}
              hiddenPhotosCount={hiddenPhotosCount}
              nextPhotosCount={nextPhotosCount}
              selectBrowseMode={selectBrowseMode}
              resetCategory={resetCategory}
              resetTopicFilters={resetTopicFilters}
              selectSection={selectSection}
              selectTopic={selectTopic}
              resetTag={resetTag}
              applyTagFilter={applyTagFilter}
              resetDateFilters={resetDateFilters}
              selectYear={selectYear}
              selectMonth={selectMonth}
              selectDay={selectDay}
              toggleTags={toggleTags}
              showMorePhotos={showMorePhotos}
              fileInputRef={fileInputRef}
              onRequestUpload={requestCabinetUpload}
              handleUpload={handleUpload}
              onOpenImage={setActivePhoto}
              onOpenDocument={openDocument}
              onDelete={removePhoto}
              onSelectCategory={selectCategory}
              onSelectTag={selectTag}
            />
          )}
        </>
      )}

      {activePhoto && (
        <Modal
          key={activePhoto}
          src={activePhoto.startsWith("http") ? activePhoto : getPhotoUrl(activePhoto)}
          onClose={() => setActivePhoto(null)}
        />
      )}

      {legalAgreementOpen && (
        <LegalAgreementModal
          accepting={legalAgreementAccepting}
          onAccept={acceptLegalAgreement}
          onClose={closeLegalAgreement}
        />
      )}

      {improvementModalMode && (
        <ImprovementRequestModal
          requiresAuth={improvementModalMode === "auth"}
          authProviders={authProviders}
          submitting={improvementRequestSubmitting}
          error={improvementRequestError}
          onProviderLogin={loginForImprovement}
          onSubmit={handleImprovementRequestSubmit}
          onClose={() => setImprovementModalMode(null)}
        />
      )}

      <PageFooter />
    </div>
  );
}

export default App;
