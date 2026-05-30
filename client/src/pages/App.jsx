import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DocumentPage from "../components/DocumentPage";
import Gallery from "../components/Gallery";
import GuestDocumentCard from "../components/GuestDocumentCard";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { useGuestDocument } from "../hooks/useGuestDocument";
import { usePhotos } from "../hooks/usePhotos";
import { getPhotoUrl, processPhoto } from "../services/api";
import { prepareImageForUpload } from "../utils/prepareImageForUpload";

function getAccessHint(user) {
  if (!user) {
    return "";
  }

  const limit = Number(user.recordLimit || 0);
  const used = Number(user.recordsUsed || 0);
  const remaining = Number(user.recordsRemaining || 0);

  if (!limit) {
    return "";
  }

  if (remaining <= 0) {
    return "Лимит бесплатного тарифа достигнут. Просмотр, поиск и удаление доступны, для новых загрузок нужно расширить доступ.";
  }

  if (remaining <= 5) {
    return `Осталось ${remaining} записей. После достижения лимита новые загрузки будут недоступны.`;
  }

  if (used >= 80) {
    return `Вы сохранили ${used} из ${limit} записей. Если понадобится больше места, можно запросить расширение доступа.`;
  }

  return "";
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

const UPLOAD_STAGE_MESSAGES = {
  preparingImage: "Подготавливаем изображение...",
  uploading: "Загружаем запись...",
  recognizing: "Распознаем текст...",
  preparing: "Готовим результат..."
};

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
  const { guestDocument, guestAccess, guestLoading, addGuestDocument } = useGuestDocument(!user);
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos(Boolean(user));
  const [activePhoto, setActivePhoto] = useState(null);
  const [documentCopiedMap, setDocumentCopiedMap] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [guestError, setGuestError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [showTags, setShowTags] = useState(false);
  const fileInputRef = useRef(null);
  const guestUploadAllowed = guestAccess?.uploadAllowed !== false;
  const guestDocumentsUsed = Number(guestAccess?.documentsUsed || 0);
  const guestDocumentLimit = Number(guestAccess?.documentLimit || 5);
  const guestLimitMessage = "Бесплатная загрузка без входа уже использована. Чтобы загрузить новую запись, войдите в кабинет.";
  const photosCount = Array.isArray(photos) ? photos.length : 0;
  const recordLimit = Number(user?.recordLimit || 100);
  const recordsUsed = Number(user?.recordsUsed ?? photosCount);
  const recordUploadAllowed = user?.recordUploadAllowed !== false;
  const activeDocumentPhoto = user && documentName
    ? photos.find((photo) => photo.name === documentName)
    : null;
  const activeDocumentInfo = activeDocumentPhoto || null;
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

  const openDocument = useCallback(function openDocument(photo, info) {
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

  async function handleUpload(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    let pendingUrl = null;
    let preparingTimer = null;

    if (!recordUploadAllowed) {
      alert("Лимит бесплатного тарифа достигнут. Для новых загрузок нужно расширить доступ.");
      event.target.value = "";
      return;
    }

    try {
      setUploading(true);
      setUploadMessage(UPLOAD_STAGE_MESSAGES.preparingImage);
      const uploadFile = await prepareImageForUpload(file);
      pendingUrl = URL.createObjectURL(uploadFile);
      const pendingName = `pending-${Date.now()}-${uploadFile.name}`;

      setPendingPhoto({
        name: pendingName,
        url: pendingUrl,
        isPendingUpload: true
      });
      setUploadMessage(UPLOAD_STAGE_MESSAGES.uploading);

      const uploadedPhoto = await addPhoto(uploadFile, { reload: false });

      if (user?.processingAllowed && uploadedPhoto?.filename) {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.recognizing);
        preparingTimer = window.setTimeout(() => {
          setUploadMessage(UPLOAD_STAGE_MESSAGES.preparing);
        }, 2500);
        await processPhoto(uploadedPhoto.filename);
        window.clearTimeout(preparingTimer);
        preparingTimer = null;
        await Promise.all([reloadPhotos(), reloadUser()]);
      } else {
        await Promise.all([reloadPhotos(), reloadUser()]);
      }

      event.target.value = "";
      setUploadMessage("");
    } catch (error) {
      console.error("Upload error:", error);
      if (error.message === "USER_RECORD_LIMIT_REACHED") {
        alert("Лимит бесплатного тарифа достигнут. Для новых загрузок нужно расширить доступ.");
      } else {
        alert("Не удалось загрузить запись");
      }
      setUploadMessage("");
    } finally {
      if (preparingTimer) {
        window.clearTimeout(preparingTimer);
      }
      if (pendingUrl) {
        URL.revokeObjectURL(pendingUrl);
      }
      setPendingPhoto(null);
      setUploading(false);
    }
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
      setUploading(true);
      setGuestError("");
      setUploadMessage(UPLOAD_STAGE_MESSAGES.preparingImage);
      const uploadFile = await prepareImageForUpload(file);
      setUploadMessage(UPLOAD_STAGE_MESSAGES.uploading);
      recognizingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.recognizing);
      }, 1200);
      preparingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.preparing);
      }, 4500);
      await addGuestDocument(uploadFile);
      window.clearTimeout(recognizingTimer);
      window.clearTimeout(preparingTimer);
      recognizingTimer = null;
      preparingTimer = null;
      setUploadMessage("");
    } catch (error) {
      console.error("Guest upload error:", error);

      if (error.message === "GUEST_LIMIT_REACHED") {
        setGuestError("Чтобы загрузить следующую запись, войдите через Google.");
      } else {
        setGuestError(error.message || "Не удалось загрузить запись.");
      }

      setUploadMessage("");
    } finally {
      if (recognizingTimer) {
        window.clearTimeout(recognizingTimer);
      }
      if (preparingTimer) {
        window.clearTimeout(preparingTimer);
      }
      event.target.value = "";
      setUploading(false);
    }
  }

  function renderGuestState() {
    return (
      <section className="guest-shell">
        <div className="guest-hero">
          <h2 className="guest-hero__title">Загрузите ваши записи</h2>
          <p className="guest-hero__text">
            Просто загрузите скан или фото нужного текста.
            <br />
            Прочитаем текст, обработаем и сохраним результат.
          </p>

          <div className="guest-hero__actions">
            {guestUploadAllowed && (
              <button
                className="guest-upload-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Загрузка..." : "Загрузить запись"}
              </button>
            )}
          </div>

          {(uploadMessage || guestError || !guestUploadAllowed) && (
            <div className="guest-hero__notice">
              <p>{guestError || uploadMessage || guestLimitMessage}</p>
            </div>
          )}

          <p className="guest-hero__counter">Гостевой режим · {guestDocumentsUsed}/{guestDocumentLimit} записей</p>

          {guestLoading ? (
            <section className="guest-placeholder guest-placeholder--embedded">
              <p className="guest-placeholder__title">Проверяем запись...</p>
            </section>
          ) : guestDocument ? (
            <GuestDocumentCard
              document={guestDocument}
              guestAccess={guestAccess}
              onOpen={setActivePhoto}
              onLogin={login}
              onUploadAnother={() => fileInputRef.current?.click()}
            />
          ) : !guestUploadAllowed ? (
            <section className="guest-placeholder guest-placeholder--embedded">
              <p className="guest-placeholder__title">Бесплатная загрузка без входа уже использована.</p>
              <p className="guest-placeholder__text">
                Чтобы попробовать еще раз и сохранить новые записи, войдите в кабинет.
              </p>
              <button className="guest-card__primary-action" type="button" onClick={login}>
                Войти в кабинет
              </button>
            </section>
          ) : null}
        </div>
      </section>
    );
  }

  if (authLoading) {
    return <div className="page page--centered">Загрузка...</div>;
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="header__logo">
          Word2you <span className="header__logo-accent">Записи</span>
        </h1>

        {!user ? (
          <button className="auth-button" type="button" onClick={login}>
            Войти через Google
          </button>
        ) : (
          <div className="profile">
            {user.avatarUrl && (
              <img className="profile__avatar" src={user.avatarUrl} alt={user.displayName} />
            )}
            <div className="profile__meta">
              <span className="profile__name">{user.displayName}</span>
              <span className="profile__hint">Бесплатный тариф · {recordsUsed}/{recordLimit} записей</span>
            </div>
            <button className="profile__logout" type="button" onClick={logout}>
              Выйти
            </button>
          </div>
        )}
      </header>

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
                  Бесплатный тариф · {recordsUsed}/{recordLimit} записей
                </p>
                {!uploading && getAccessHint(user) && (
                  <p className="upload-panel__message">{getAccessHint(user)}</p>
                )}
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

              {photosCount > 0 || pendingPhoto ? (
                <Gallery
                  photos={filteredPhotos}
                  pendingPhoto={pendingPhoto}
                  onOpen={setActivePhoto}
                  onOpenDocument={openDocument}
                  onDelete={removePhoto}
                  uploadMessage={uploadMessage}
                  emptyMessage="Ничего не найдено."
                  onSelectCategory={selectCategory}
                  onSelectTag={selectTag}
                />
              ) : (
                <p className="gallery__empty gallery__empty--cabinet">Пока нет загруженных записей.</p>
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            className="upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={uploading || !recordUploadAllowed}
          />

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
        </>
      )}

      {activePhoto && <Modal src={activePhoto.startsWith("http") ? activePhoto : getPhotoUrl(activePhoto)} onClose={() => setActivePhoto(null)} />}
    </div>
  );
}

export default App;
