import { useRef, useState } from "react";
import Gallery from "../components/Gallery";
import GuestDocumentCard from "../components/GuestDocumentCard";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { useGuestDocument } from "../hooks/useGuestDocument";
import { usePhotos } from "../hooks/usePhotos";
import { getPhotoUrl, processPhoto } from "../services/api";

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

function App() {
  const { user, authLoading, login, logout, reloadUser } = useAuth();
  const { guestDocument, guestAccess, guestLoading, addGuestDocument } = useGuestDocument(!user);
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos(Boolean(user));
  const [activePhoto, setActivePhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [guestError, setGuestError] = useState("");
  const fileInputRef = useRef(null);
  const guestUploadAllowed = guestAccess?.uploadAllowed !== false;
  const guestDocumentsUsed = Number(guestAccess?.documentsUsed || 0);
  const guestLimitMessage = "Бесплатная загрузка без входа уже использована. Чтобы загрузить новый документ, войдите в кабинет.";
  const photosCount = Array.isArray(photos) ? photos.length : 0;
  const showCabinetUploadButton = photosCount < 3;

  async function handleUpload(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    const pendingUrl = URL.createObjectURL(file);
    const pendingName = `pending-${Date.now()}-${file.name}`;

    try {
      setPendingPhoto({
        name: pendingName,
        url: pendingUrl,
        isPendingUpload: true
      });
      setUploading(true);
      setUploadMessage("Загрузка документа...");

      const uploadedPhoto = await addPhoto(file, { reload: false });

      if (user?.processingAllowed && uploadedPhoto?.filename) {
        setUploadMessage("Документ загружен. Запускаем обработку...");
        await processPhoto(uploadedPhoto.filename);
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
      URL.revokeObjectURL(pendingUrl);
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

    try {
      setUploading(true);
      setGuestError("");
      setUploadMessage("Загружаем документ и извлекаем текст...");
      await addGuestDocument(file);
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
          ) : guestDocumentsUsed > 0 ? (
            <section className="guest-placeholder guest-placeholder--embedded">
              <p className="guest-placeholder__title">Бесплатная загрузка без входа уже использована.</p>
              <p className="guest-placeholder__text">
                Чтобы попробовать еще раз и сохранить новые документы, войдите в кабинет.
              </p>
              <button className="auth-button" type="button" onClick={login}>
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
        <h1 className="header__logo">Твой мир 1.1</h1>

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
          <section className="upload-panel upload-panel--cabinet">
            {showCabinetUploadButton && (
              <button
                className="guest-upload-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Загрузить документ
              </button>
            )}
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
              onDelete={removePhoto}
              uploadMessage={uploadMessage}
            />
          ) : (
            <p className="gallery__empty gallery__empty--cabinet">Пока нет загруженных документов.</p>
          )}

          <input
            ref={fileInputRef}
            className="upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={uploading}
          />

          {!showCabinetUploadButton && (
            <button
              className="fab-upload"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Добавить документ"
              aria-label="Добавить документ"
            >
              <PlusIcon />
            </button>
          )}
        </>
      )}

      {activePhoto && <Modal src={activePhoto.startsWith("http") ? activePhoto : getPhotoUrl(activePhoto)} onClose={() => setActivePhoto(null)} />}
    </div>
  );
}

export default App;
