import { useCallback, useRef, useState } from "react";
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

function getProcessingHint(user) {
  if (!user) {
    return "";
  }

  if (!user.processingAllowed) {
    return "Функция обработки фото вам недоступна.";
  }

  if (user.processingUnlimited) {
    return "Автообработка включена без лимита.";
  }

  return `Осталось обработок: ${user.processingRemaining}`;
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
  uploading: "Загружаем документ...",
  recognizing: "Распознаем текст...",
  preparing: "Готовим результат..."
};

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
  const fileInputRef = useRef(null);
  const guestUploadAllowed = guestAccess?.uploadAllowed !== false;
  const guestDocumentsUsed = Number(guestAccess?.documentsUsed || 0);
  const guestLimitMessage = "Бесплатная загрузка без входа уже использована. Чтобы загрузить новый документ, войдите в кабинет.";
  const photosCount = Array.isArray(photos) ? photos.length : 0;
  const activeDocumentPhoto = user && documentName
    ? photos.find((photo) => photo.name === documentName)
    : null;
  const activeDocumentInfo = activeDocumentPhoto || null;

  const openDocument = useCallback(function openDocument(photo, info) {
    setDocumentCopiedMap({});
    navigate(`/documents/${encodeURIComponent(photo.name)}`);
  }, [navigate]);

  const closeDocument = useCallback(function closeDocument() {
    setDocumentCopiedMap({});
    navigate("/");
  }, [navigate]);

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
      alert("Не удалось загрузить документ");
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
        setGuestError("Чтобы загрузить следующий документ, войдите через Google.");
      } else {
        setGuestError(error.message || "Не удалось загрузить документ.");
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
          <h2 className="guest-hero__title">Загрузите документ</h2>
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
                {uploading ? "Загрузка..." : "Загрузить документ"}
              </button>
            )}
          </div>

          {(uploadMessage || guestError || !guestUploadAllowed) && (
            <div className="guest-hero__notice">
              <p>{guestError || uploadMessage || guestLimitMessage}</p>
            </div>
          )}

          <p className="guest-hero__counter">Загружено документов без входа: {guestDocumentsUsed}</p>

          {guestLoading ? (
            <section className="guest-placeholder guest-placeholder--embedded">
              <p className="guest-placeholder__title">Проверяем документ...</p>
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
                Чтобы попробовать еще раз и сохранить новые документы, войдите в кабинет.
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
        <h1 className="header__logo">Word2you</h1>

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
              <span className="profile__hint">{getProcessingHint(user)}</span>
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
            />
          ) : (
            <>
              <section className="upload-panel upload-panel--cabinet">
                <button
                  className="guest-upload-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Загрузить документ
                </button>
                <p className="guest-hero__counter upload-panel__counter">
                  Загружено документов: {photosCount}
                </p>
                {!uploading && !user.processingAllowed && (
                  <p className="upload-panel__message">{getProcessingHint(user)}</p>
                )}
              </section>

              {photosCount > 0 || pendingPhoto ? (
                <Gallery
                  photos={photos}
                  pendingPhoto={pendingPhoto}
                  onOpen={setActivePhoto}
                  onOpenDocument={openDocument}
                  onDelete={removePhoto}
                  uploadMessage={uploadMessage}
                />
              ) : (
                <p className="gallery__empty gallery__empty--cabinet">Пока нет загруженных документов.</p>
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            className="upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={uploading}
          />

          <button
            className="fab-upload"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || Boolean(documentName)}
            title="Добавить документ"
            aria-label="Добавить документ"
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
