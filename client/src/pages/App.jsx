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
  const [guestError, setGuestError] = useState("");
  const fileInputRef = useRef(null);
  const guestUploadAllowed = guestAccess?.uploadAllowed !== false;
  const guestDocumentsUsed = Number(guestAccess?.documentsUsed || 0);
  const guestLimitMessage = "Вы уже загрузили документ. Чтобы сохранить его и продолжить, войдите через Google.";

  async function handleUpload(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      setUploading(true);
      setUploadMessage("Загрузка фото...");

      const uploadedPhoto = await addPhoto(file);

      if (user?.processingAllowed && uploadedPhoto?.filename) {
        setUploadMessage("Фото загружено. Запускаем обработку...");
        await processPhoto(uploadedPhoto.filename);
        await Promise.all([reloadPhotos(), reloadUser()]);
      } else {
        await reloadUser();
      }

      event.target.value = "";
      setUploadMessage("");
    } catch (error) {
      console.error("Upload error:", error);
      alert("Не удалось загрузить фото");
      setUploadMessage("");
    } finally {
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
          <h2 className="guest-hero__title">Загрузите фото документа</h2>
          <p className="guest-hero__text">
            Просто загрузите скан или фото нужного текста. Прочитаем текст, обработаем,
            сохраним.
          </p>

          <div className="guest-hero__actions">
            <button className="auth-button" type="button" onClick={login}>
              Войти через Google
            </button>
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

          {guestDocumentsUsed > 0 && (
            <div className="guest-hero__notice">
              <p>Без входа уже загружено документов: {guestDocumentsUsed}</p>
            </div>
          )}
        </div>

        {guestLoading ? (
          <section className="guest-placeholder">
            <p className="guest-placeholder__title">Проверяем документ...</p>
          </section>
        ) : guestDocument ? (
          <GuestDocumentCard document={guestDocument} onOpen={setActivePhoto} onLogin={login} />
        ) : (
          <section className="guest-placeholder">
            {guestDocumentsUsed > 0 ? (
              <>
                <p className="guest-placeholder__title">Документ уже был перенесен в аккаунт</p>
                <p className="guest-placeholder__text">
                  Без входа уже загружено документов: {guestDocumentsUsed}. Войдите через Google,
                  чтобы увидеть сохраненный документ в списке.
                </p>
              </>
            ) : (
              <>
                <p className="guest-placeholder__title">Документ еще не загружен</p>
                <p className="guest-placeholder__text">
                  Загрузите одно фото, чтобы сразу увидеть извлеченный текст.
                </p>
              </>
            )}
          </section>
        )}
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
          {(uploadMessage || !user.processingAllowed) && (
            <section className="upload-panel">
              <p className="upload-panel__message">
                {uploading ? uploadMessage : getProcessingHint(user)}
              </p>
            </section>
          )}

          {Array.isArray(photos) && photos.length > 0 ? (
            <Gallery photos={photos} onOpen={setActivePhoto} onDelete={removePhoto} />
          ) : (
            <p className="gallery__empty">Пока нет загруженных фотографий.</p>
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
            disabled={uploading}
            title="Добавить фото"
            aria-label="Добавить фото"
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
