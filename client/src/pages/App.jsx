import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import DocumentPage from "../components/DocumentPage";
import Gallery from "../components/Gallery";
import GuestHome from "../components/GuestHome";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { UPLOAD_STAGE_MESSAGES, useCabinetUpload } from "../hooks/useCabinetUpload";
import { useGuestDocument } from "../hooks/useGuestDocument";
import { usePhotos } from "../hooks/usePhotos";
import { createAccessRequest, getGuestDocumentFileUrl, getPhotoUrl } from "../services/api";
import { prepareImageForUpload } from "../utils/prepareImageForUpload";

function AccessRequestForm() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleClick() {
    try {
      setStatus("sending");
      setError("");
      await createAccessRequest({ message: "" });
      setStatus("sent");
    } catch (requestError) {
      setError(requestError.message || "Не удалось отправить заявку");
      setStatus("idle");
    }
  }

  return (
    <span className="access-request">
      {status === "sent" ? (
        <span className="access-request__sent">✓ Вы запросили продление доступа. Проверьте вашу почту</span>
      ) : (
        <>
          <button className="access-request__link" type="button" onClick={handleClick} disabled={status === "sending"}>
            {status === "sending" ? "отправляем запрос..." : "запросить продление доступа на 1 месяц"}
          </button>
          {error && <span className="access-request__error">{error}</span>}
        </>
      )}
    </span>
  );
}

function AccessLimitMessage({ user }) {
  if (user?.unlimitedAccess || user?.extendedAccessActive) {
    return null;
  }

  const limit = Number(user?.recordLimit || 0);
  const used = Number(user?.recordsUsed || 0);
  const remaining = Number(user?.recordsRemaining || 0);

  if (!limit) {
    return null;
  }

  if (remaining <= 0) {
    return (
      <p className="upload-panel__message">
        Лимит бесплатного тарифа достигнут, <AccessRequestForm />
      </p>
    );
  }

  if (remaining <= 5) {
    return (
      <p className="upload-panel__message">
        Осталось {remaining} записей. После достижения лимита новые загрузки будут недоступны.
      </p>
    );
  }

  if (used >= 80) {
    return (
      <p className="upload-panel__message">
        Вы сохранили {used} из {limit} записей. Если понадобится больше места, можно запросить продление доступа.
      </p>
    );
  }

  return null;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function CabinetEmptyState() {
  return (
    <section className="cabinet-empty-state">
      <h2>Загрузите ваши записи</h2>
      <p>
        Просто загрузите скан или фото нужного текста.
        <br />
        Прочитаем текст, обработаем и сохраним результат.
      </p>
    </section>
  );
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getPhotoSearchText(photo) {
  return [
    photo?.title,
    photo?.summary,
    photo?.category,
    Array.isArray(photo?.tags) ? photo.tags.join(" ") : "",
    photo?.cleanText,
    photo?.text
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getCategoryOptions(photos) {
  return Array.from(
    new Set(
      photos
        .map((photo) => String(photo?.category || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));
}

function getTagOptions(photos) {
  return Array.from(
    new Set(
      photos
        .flatMap((photo) => (Array.isArray(photo?.tags) ? photo.tags : []))
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));
}

function App() {
  const navigate = useNavigate();
  const { documentName } = useParams();
  const { user, authLoading, login, logout, reloadUser } = useAuth();
  const { guestDocuments, guestAccess, guestLoading, addGuestDocument } = useGuestDocument(!user);
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos(Boolean(user));
  const [activePhoto, setActivePhoto] = useState(null);
  const [documentCopiedMap, setDocumentCopiedMap] = useState({});
  const [guestUploading, setGuestUploading] = useState(false);
  const [guestUploadMessage, setGuestUploadMessage] = useState("");
  const [guestError, setGuestError] = useState("");
  const [activeGuestDocument, setActiveGuestDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [showTags, setShowTags] = useState(false);
  const fileInputRef = useRef(null);
  const guestReplaceDocumentIdRef = useRef(null);
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
  const categoryOptions = useMemo(() => getCategoryOptions(photos), [photos]);
  const tagOptions = useMemo(() => getTagOptions(photos), [photos]);
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      if (activeCategory && photo.category !== activeCategory) {
        return false;
      }

      if (activeTag && !photo.tags?.includes(activeTag)) {
        return false;
      }

      if (!normalizedSearchQuery) {
        return true;
      }

      return getPhotoSearchText(photo).includes(normalizedSearchQuery);
    });
  }, [photos, activeCategory, activeTag, normalizedSearchQuery]);

  const openDocument = useCallback(function openDocument(photo) {
    setDocumentCopiedMap({});
    navigate(`/documents/${encodeURIComponent(photo.name)}`);
  }, [navigate]);

  const closeDocument = useCallback(function closeDocument() {
    setDocumentCopiedMap({});
    navigate("/");
  }, [navigate]);

  const selectCategory = useCallback(function selectCategory(category) {
    setSearchQuery("");
    setActiveCategory(category);
    setDocumentCopiedMap({});
    navigate("/");
  }, [navigate]);

  const selectTag = useCallback(function selectTag(tag) {
    setSearchQuery("");
    setActiveTag(tag);
    setShowTags(true);
    setDocumentCopiedMap({});
    navigate("/");
  }, [navigate]);

  function toggleTags() {
    setShowTags((current) => {
      if (current) {
        setActiveTag("");
      }

      return !current;
    });
  }

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

  function openGuestUpload(replaceDocumentId = null) {
    guestReplaceDocumentIdRef.current = replaceDocumentId;
    fileInputRef.current?.click();
  }

  async function handleGuestUpload(event) {
    if (!guestUploadAllowed) {
      setGuestError(guestLimitMessage);
      event.target.value = "";
      return;
    }

    const file = event.target.files[0];

    if (!file) {
      return;
    }

    let recognizingTimer = null;
    let preparingTimer = null;

    try {
      setGuestUploading(true);
      setGuestError("");
      setActiveGuestDocument(null);
      setGuestUploadMessage(UPLOAD_STAGE_MESSAGES.preparingImage);
      const uploadFile = await prepareImageForUpload(file);
      setGuestUploadMessage(UPLOAD_STAGE_MESSAGES.uploading);
      recognizingTimer = window.setTimeout(() => {
        setGuestUploadMessage(UPLOAD_STAGE_MESSAGES.recognizing);
      }, 1200);
      preparingTimer = window.setTimeout(() => {
        setGuestUploadMessage(UPLOAD_STAGE_MESSAGES.preparing);
      }, 4500);
      await addGuestDocument(uploadFile, {
        replaceDocumentId: guestReplaceDocumentIdRef.current
      });
      window.clearTimeout(recognizingTimer);
      window.clearTimeout(preparingTimer);
      recognizingTimer = null;
      preparingTimer = null;
      setGuestUploadMessage("");
    } catch (error) {
      console.error("Guest upload error:", error);

      if (error.message === "GUEST_LIMIT_REACHED") {
        setGuestError("Чтобы загрузить следующую запись, войдите через Google.");
      } else {
        setGuestError(error.message || "Не удалось загрузить запись.");
      }

      setGuestUploadMessage("");
    } finally {
      if (recognizingTimer) {
        window.clearTimeout(recognizingTimer);
      }
      if (preparingTimer) {
        window.clearTimeout(preparingTimer);
      }
      event.target.value = "";
      guestReplaceDocumentIdRef.current = null;
      setGuestUploading(false);
    }
  }

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
                        onClick={() => setActiveCategory("")}
                      >
                        Все
                      </button>
                      {categoryOptions.map((category) => (
                        <button
                          className={`cabinet-categories__button ${activeCategory === category ? "cabinet-categories__button--active" : ""}`}
                          type="button"
                          key={category}
                          onClick={() => setActiveCategory(category)}
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
                              onClick={() => setActiveTag("")}
                            >
                              Все теги
                            </button>
                          )}
                          {tagOptions.map((tag) => (
                            <button
                              className={`cabinet-categories__button ${activeTag === tag ? "cabinet-categories__button--active" : ""}`}
                              type="button"
                              key={tag}
                              onClick={() => setActiveTag(tag)}
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
