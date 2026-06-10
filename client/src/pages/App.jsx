import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AccessLimitMessage from "../components/AccessLimitMessage";
import AppHeader from "../components/AppHeader";
import CabinetEmptyState from "../components/CabinetEmptyState";
import DocumentPage from "../components/DocumentPage";
import Gallery from "../components/Gallery";
import GuestHome from "../components/GuestHome";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { useCabinetFilters } from "../hooks/useCabinetFilters";
import { useCabinetUpload } from "../hooks/useCabinetUpload";
import { useGuestDocument } from "../hooks/useGuestDocument";
import { useGuestUpload } from "../hooks/useGuestUpload";
import { usePhotos } from "../hooks/usePhotos";
import { getGuestDocumentFileUrl, getPhotoUrl } from "../services/api";

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function App() {
  const navigate = useNavigate();
  const { documentName } = useParams();
  const { user, authLoading, login, logout, reloadUser } = useAuth();
  const { guestDocuments, guestAccess, guestLoading, addGuestDocument } = useGuestDocument(!user);
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos(Boolean(user));
  const [activePhoto, setActivePhoto] = useState(null);
  const [documentCopiedMap, setDocumentCopiedMap] = useState({});
  const [activeGuestDocument, setActiveGuestDocument] = useState(null);
  const fileInputRef = useRef(null);
  const guestUploadAllowed = guestAccess?.uploadAllowed !== false;
  const guestLimitMessage = "Гостевая загрузка без входа уже использована. Чтобы загрузить новую запись, войдите в кабинет.";
  const photosCount = Array.isArray(photos) ? photos.length : 0;
  const recordLimit = Number(user?.recordLimit || 100);
  const recordsUsed = Number(user?.recordsUsed ?? photosCount);
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
  const activeDocumentPhoto = user && documentName
    ? photos.find((photo) => photo.name === documentName)
    : null;
  const activeDocumentInfo = activeDocumentPhoto || null;
  const activeGuestPhoto = activeGuestDocument
    ? {
      name: getGuestDocumentFileUrl(activeGuestDocument.id, activeGuestDocument.updatedAt || activeGuestDocument.filename),
      url: getGuestDocumentFileUrl(activeGuestDocument.id, activeGuestDocument.updatedAt || activeGuestDocument.filename)
    }
    : null;
  const activeGuestInfo = activeGuestDocument
    ? {
      status: activeGuestDocument.status,
      title: activeGuestDocument.title || "Запись",
      summary: activeGuestDocument.summary || "",
      category: activeGuestDocument.category || "",
      tags: Array.isArray(activeGuestDocument.tags) ? activeGuestDocument.tags : [],
      text: activeGuestDocument.text || "",
      cleanText: activeGuestDocument.cleanText || "",
      textQuality: activeGuestDocument.textQuality || "",
      notes: activeGuestDocument.notes || "",
      error: activeGuestDocument.error || null,
      createdAt: activeGuestDocument.createdAt || null
    }
    : null;
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
    setDocumentCopiedMap({});
    navigate(`/documents/${encodeURIComponent(photo.name)}`);
  }, [navigate]);

  const closeDocument = useCallback(function closeDocument() {
    setDocumentCopiedMap({});
    navigate("/");
  }, [navigate]);

  const selectCategory = useCallback(function selectCategory(category) {
    applyCategoryFilter(category);
    setDocumentCopiedMap({});
    navigate("/");
  }, [applyCategoryFilter, navigate]);

  const selectTag = useCallback(function selectTag(tag) {
    applyTagFilter(tag);
    setDocumentCopiedMap({});
    navigate("/");
  }, [applyTagFilter, navigate]);

  const handleDocumentCopy = useCallback(async function handleDocumentCopy(key, text) {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setDocumentCopiedMap((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setDocumentCopiedMap((prev) => ({ ...prev, [key]: false }));
      }, 1500);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Не удалось скопировать текст");
    }
  }, []);

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
        onLogin={login}
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
            <>
              <section className="upload-panel upload-panel--cabinet">
                <button
                  className="guest-upload-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !recordUploadAllowed}
                >
                  Загрузить запись
                </button>
                <p className="guest-hero__counter upload-panel__counter">
                  Загружено записей: {recordsUsed}
                </p>
                {!uploading && <AccessLimitMessage user={user} />}
              </section>

              {photosCount > 0 && (
                <section className="cabinet-filter">
                  <div className="cabinet-search">
                    <input
                      className="cabinet-search__input"
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Фильтр/поиск"
                      aria-label="Фильтр/поиск"
                    />
                  </div>

                  {categoryOptions.length > 0 && (
                    <div className="cabinet-categories" aria-label="Фильтр по рубрикам">
                      <button
                        className={`cabinet-categories__button ${!activeCategory ? "cabinet-categories__button--active" : ""}`}
                        type="button"
                        onClick={resetCategory}
                      >
                        Все
                      </button>
                      {categoryOptions.map((category) => (
                        <button
                          className={`cabinet-categories__button ${activeCategory === category ? "cabinet-categories__button--active" : ""}`}
                          type="button"
                          key={category}
                          onClick={() => applyCategoryFilter(category)}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  )}

                  {tagOptions.length > 0 && (
                    <div className="cabinet-tags">
                      <button
                        className="cabinet-tags__toggle"
                        type="button"
                        onClick={toggleTags}
                        aria-expanded={showTags}
                      >
                        Ваши теги
                        <span className="cabinet-tags__chevron" aria-hidden="true" />
                      </button>

                      {(showTags || activeTag) && (
                        <div className="cabinet-tags__list" aria-label="Фильтр по тегам">
                          {activeTag && (
                            <button
                              className="cabinet-categories__button"
                              type="button"
                              onClick={resetTag}
                            >
                              Все теги
                            </button>
                          )}
                          {tagOptions.map((tag) => (
                            <button
                              className={`cabinet-categories__button ${activeTag === tag ? "cabinet-categories__button--active" : ""}`}
                              type="button"
                              key={tag}
                              onClick={() => applyTagFilter(tag)}
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {photosCount > 0 || pendingPhotos.length > 0 ? (
                <Gallery
                  photos={filteredPhotos}
                  pendingPhotos={pendingPhotos}
                  onOpen={setActivePhoto}
                  onOpenDocument={openDocument}
                  onDelete={removePhoto}
                  uploadMessage={uploadMessage}
                  emptyMessage="Ничего не найдено."
                  onSelectCategory={selectCategory}
                  onSelectTag={selectTag}
                />
              ) : (
                <CabinetEmptyState />
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            className="upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleUpload}
            disabled={uploading || !recordUploadAllowed}
          />

          {photosCount >= 5 && (
            <button
              className="fab-upload"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || Boolean(documentName) || !recordUploadAllowed}
              title="Добавить запись"
              aria-label="Добавить запись"
            >
              <PlusIcon />
            </button>
          )}
        </>
      )}

      {activePhoto && <Modal src={activePhoto.startsWith("http") ? activePhoto : getPhotoUrl(activePhoto)} onClose={() => setActivePhoto(null)} />}

      <footer className="page-footer">
        <Link className="topbar__link" to="/about">
          О проекте
        </Link>
      </footer>
    </div>
  );
}

export default App;
