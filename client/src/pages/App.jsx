import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DocumentPage from "../components/DocumentPage";
import Gallery from "../components/Gallery";
import GuestDocumentCard from "../components/GuestDocumentCard";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { useGuestDocument } from "../hooks/useGuestDocument";
import { usePhotos } from "../hooks/usePhotos";
import { createAccessRequest, getGuestDocumentFileUrl, getPhotoUrl, processPhoto } from "../services/api";
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
  const { guestDocuments, guestAccess, guestLoading, addGuestDocument } = useGuestDocument(!user);
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos(Boolean(user));
  const [activePhoto, setActivePhoto] = useState(null);
  const [documentCopiedMap, setDocumentCopiedMap] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [guestError, setGuestError] = useState("");
  const [activeGuestDocument, setActiveGuestDocument] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [showTags, setShowTags] = useState(false);
  const fileInputRef = useRef(null);
  const guestReplaceDocumentIdRef = useRef(null);
  const guestUploadAllowed = guestAccess?.uploadAllowed !== false;
  const guestDocumentsUsed = Number(guestAccess?.documentsUsed || 0);
  const guestDocumentLimit = Number(guestAccess?.documentLimit || 5);
  const guestLimitMessage = "Гостевая загрузка без входа уже использована. Чтобы загрузить новую запись, войдите в кабинет.";
  const photosCount = Array.isArray(photos) ? photos.length : 0;
  const recordLimit = Number(user?.recordLimit || 100);
  const recordsUsed = Number(user?.recordsUsed ?? photosCount);
  const recordUploadAllowed = user?.recordUploadAllowed !== false;
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

  function openGuestUpload(replaceDocumentId = null) {
    guestReplaceDocumentIdRef.current = replaceDocumentId;
    fileInputRef.current?.click();
  }

  function renderGuestLimitNotice() {
    return (
      <>
        Гостевая загрузка без входа уже использована. Чтобы загрузить новую запись,{" "}
        <button className="guest-hero__notice-link" type="button" onClick={login}>
          войдите в кабинет
        </button>
        .
      </>
    );
  }

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
      setActiveGuestDocument(null);
      setUploadMessage(UPLOAD_STAGE_MESSAGES.preparingImage);
      const uploadFile = await prepareImageForUpload(file);
      setUploadMessage(UPLOAD_STAGE_MESSAGES.uploading);
      recognizingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.recognizing);
      }, 1200);
      preparingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.preparing);
      }, 4500);
      await addGuestDocument(uploadFile, {
        replaceDocumentId: guestReplaceDocumentIdRef.current
      });
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
      guestReplaceDocumentIdRef.current = null;
      setUploading(false);
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
                onClick={() => openGuestUpload()}
                disabled={uploading}
              >
                {uploading ? "Загрузка..." : "Загрузить запись"}
              </button>
            )}
          </div>

          {(uploadMessage || guestError || !guestUploadAllowed) && (
            <div className="guest-hero__notice">
              <p>{guestError || uploadMessage || renderGuestLimitNotice()}</p>
            </div>
          )}

          <p className="guest-hero__counter">Гостевой режим · {guestDocumentsUsed}/{guestDocumentLimit} записей</p>

          {guestLoading ? (
            <section className="guest-placeholder guest-placeholder--embedded">
              <p className="guest-placeholder__title">Проверяем запись...</p>
            </section>
          ) : guestDocuments.length > 0 ? (
            <>
              <section className="gallery guest-documents-list">
                {guestDocuments.map((document) => (
                  <GuestDocumentCard
                    key={document.id}
                  document={document}
                  onOpen={setActivePhoto}
                  onOpenDocument={setActiveGuestDocument}
                  onUploadAnother={openGuestUpload}
                />
              ))}
              </section>

              <section className="guest-login-cta">
                <p>Чтобы сохранить ваши записи и продолжить работу, войдите через Google.</p>
                <button className="guest-card__primary-action" type="button" onClick={login}>
                  Войти через Google
                </button>
              </section>
            </>
          ) : !guestUploadAllowed ? (
            <section className="guest-placeholder guest-placeholder--embedded">
              <p className="guest-placeholder__title">Гостевая загрузка без входа уже использована.</p>
              <p className="guest-placeholder__text">
                Чтобы попробовать еще раз и сохранить новые записи,{" "}
                <button className="guest-hero__notice-link" type="button" onClick={login}>
                  войдите в кабинет
                </button>
                .
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
