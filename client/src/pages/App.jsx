import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import CabinetHome from "../components/CabinetHome";
import DocumentPage from "../components/DocumentPage";
import GuestHome from "../components/GuestHome";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { useCabinetFilters } from "../hooks/useCabinetFilters";
import { useCabinetUpload } from "../hooks/useCabinetUpload";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { useGuestDocument } from "../hooks/useGuestDocument";
import { useGuestDocumentPageData } from "../hooks/useGuestDocumentPageData";
import { useGuestUpload } from "../hooks/useGuestUpload";
import { usePhotos } from "../hooks/usePhotos";
import { getPhotoUrl } from "../services/api";

function App() {
  const navigate = useNavigate();
  const { documentName } = useParams();
  const { user, authProviders, authLoading, login, loginWithYandex, logout, reloadUser } = useAuth();
  const { guestDocuments, guestAccess, guestLoading, addGuestDocument } = useGuestDocument(!user);
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos(Boolean(user), {
    onPhotosChanged: reloadUser
  });
  const [activePhoto, setActivePhoto] = useState(null);
  const [activeGuestDocument, setActiveGuestDocument] = useState(null);
  const { copiedMap: documentCopiedMap, copyText: handleDocumentCopy, resetCopied } = useCopyFeedback();
  const fileInputRef = useRef(null);
  const guestUploadAllowed = guestAccess?.uploadAllowed !== false;
  const guestLimitMessage = "Гостевая загрузка без входа уже использована. Чтобы загрузить новую запись, войдите в кабинет.";
  const photosCount = Array.isArray(photos) ? photos.length : 0;
  const recordLimit = Number(user?.recordLimit || 100);
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
  const {
    uploading: guestUploading,
    uploadMessage: guestUploadMessage,
    error: guestError,
    replacingDocumentId,
    openUpload: openGuestUpload,
    handleUpload: handleGuestUpload
  } = useGuestUpload({
    uploadAllowed: guestUploadAllowed,
    limitMessage: guestLimitMessage,
    addGuestDocument,
    onUploadStart: () => setActiveGuestDocument(null),
    fileInputRef
  });
  const uploading = user ? cabinetUploading : guestUploading;
  const uploadMessage = user ? cabinetUploadMessage : guestUploadMessage;
  const { photo: activeGuestPhoto, info: activeGuestInfo } = useGuestDocumentPageData(activeGuestDocument);
  const activeDocumentPhoto = user && documentName
    ? photos.find((photo) => photo.name === documentName)
    : null;
  const activeDocumentInfo = activeDocumentPhoto || null;
  const {
    searchQuery,
    setSearchQuery,
    activeCategory,
    activeTag,
    showTags,
    categoryOptions,
    tagOptions,
    filteredPhotos,
    resetCategory,
    selectCategory: applyCategoryFilter,
    resetTag,
    selectTag: applyTagFilter,
    toggleTags
  } = useCabinetFilters(photos);

  const openDocument = useCallback(function openDocument(photo) {
    resetCopied();
    navigate(`/documents/${encodeURIComponent(photo.name)}`);
  }, [navigate, resetCopied]);

  const closeDocument = useCallback(function closeDocument() {
    resetCopied();
    navigate("/");
  }, [navigate, resetCopied]);

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

  function renderGuestState() {
    if (activeGuestDocument) {
      return (
        <DocumentPage
          photo={activeGuestPhoto}
          info={activeGuestInfo}
          copiedMap={documentCopiedMap}
          onBack={() => setActiveGuestDocument(null)}
          onOpenImage={setActivePhoto}
          onCopy={handleDocumentCopy}
        />
      );
    }

    return (
      <GuestHome
        documents={guestDocuments}
        access={guestAccess}
        loading={guestLoading}
        uploading={uploading}
        uploadMessage={uploadMessage}
        error={guestError}
        replacingDocumentId={replacingDocumentId}
        onUpload={openGuestUpload}
        onOpenImage={setActivePhoto}
        onOpenDocument={setActiveGuestDocument}
        onUploadAnother={openGuestUpload}
        onLogin={login}
        onYandexLogin={loginWithYandex}
        authProviders={authProviders}
      />
    );
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
        onLogin={login}
        onYandexLogin={loginWithYandex}
        onLogout={logout}
      />

      {!user && (
        <>
          {renderGuestState()}

          <input
            ref={fileInputRef}
            className="upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleGuestUpload}
            disabled={uploading || !guestUploadAllowed}
          />
        </>
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
            />
          ) : (
            <CabinetHome
              user={user}
              recordsUsed={photosCount}
              photosCount={photosCount}
              pendingPhotos={pendingPhotos}
              filteredPhotos={filteredPhotos}
              uploadMessage={uploadMessage}
              uploading={uploading}
              recordUploadAllowed={recordUploadAllowed}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              activeCategory={activeCategory}
              activeTag={activeTag}
              showTags={showTags}
              categoryOptions={categoryOptions}
              tagOptions={tagOptions}
              resetCategory={resetCategory}
              applyCategoryFilter={applyCategoryFilter}
              resetTag={resetTag}
              applyTagFilter={applyTagFilter}
              toggleTags={toggleTags}
              fileInputRef={fileInputRef}
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

      {activePhoto && <Modal src={activePhoto.startsWith("http") ? activePhoto : getPhotoUrl(activePhoto)} onClose={() => setActivePhoto(null)} />}

      <footer className="page-footer">
        <Link className="topbar__link" to="/about">
          О проекте
        </Link>
        <Link className="topbar__link" to="/packages">
          Пакеты
        </Link>
      </footer>
    </div>
  );
}

export default App;
