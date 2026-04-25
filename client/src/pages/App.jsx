import { useRef, useState } from "react";
import Gallery from "../components/Gallery";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
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

function App() {
  const { user, login, logout, reloadUser } = useAuth();
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos();
  const [activePhoto, setActivePhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef(null);

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

      {user && (
        <section className="upload-panel">
          <div className="upload-panel__controls">
            <button
              className="upload-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Загружаем..." : "Добавить фото"}
            </button>
            <input
              ref={fileInputRef}
              className="upload-input"
              type="file"
              onChange={handleUpload}
              disabled={uploading}
            />
          </div>

          {(uploadMessage || !user.processingAllowed) && (
            <p className="upload-panel__message">
              {uploading ? uploadMessage : getProcessingHint(user)}
            </p>
          )}
        </section>
      )}

      {user && (
        <>
          {Array.isArray(photos) && photos.length > 0 ? (
            <Gallery photos={photos} onOpen={setActivePhoto} onDelete={removePhoto} />
          ) : (
            <p className="gallery__empty">Пока нет загруженных фотографий.</p>
          )}
        </>
      )}

      {activePhoto && (
        <Modal src={getPhotoUrl(activePhoto)} onClose={() => setActivePhoto(null)} />
      )}
    </div>
  );
}

export default App;
