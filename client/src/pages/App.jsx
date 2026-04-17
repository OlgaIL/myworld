import { useState } from "react";
import Gallery from "../components/Gallery";
import Modal from "../components/Modal";
import { useAuth } from "../hooks/useAuth";
import { usePhotos } from "../hooks/usePhotos";
import { getPhotoUrl, processPhoto } from "../services/api";

function App() {
  const { user, login, logout } = useAuth();
  const { photos, addPhoto, removePhoto, reloadPhotos } = usePhotos();
  const [activePhoto, setActivePhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  async function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadMessage("Загрузка фото...");

      const uploadedPhoto = await addPhoto(file);

      if (user?.processingAllowed && uploadedPhoto?.filename) {
        setUploadMessage("Фото загружено. Запускаем обработку...");
        await processPhoto(uploadedPhoto.filename);
        await reloadPhotos();
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
      <h1 className="header__logo">Твой мир 1.1</h1>

      {!user ? (
        <button className="auth-button" onClick={login}>
          Войти через Google
        </button>
      ) : (
        <>
          <div className="profile">
            <span>{user.displayName}</span>
            <button onClick={logout}>Выйти</button>
          </div>

          <input type="file" onChange={handleUpload} disabled={uploading} />

          {uploading && <p style={{ marginTop: "10px" }}>{uploadMessage || "Загрузка фото..."}</p>}

          {Array.isArray(photos) && photos.length > 0 ? (
            <Gallery
              photos={photos}
              processingAllowed={Boolean(user?.processingAllowed)}
              onOpen={setActivePhoto}
              onDelete={removePhoto}
            />
          ) : (
            <p style={{ marginTop: "20px" }}>Пока нет загруженных фотографий</p>
          )}

          {!user?.processingAllowed && (
            <p style={{ marginTop: "20px" }}>
              Обработка фото сейчас скрыта для пользователей вне разрешенного списка.
            </p>
          )}
        </>
      )}

      {activePhoto && (
        <Modal
          src={getPhotoUrl(activePhoto)}
          onClose={() => setActivePhoto(null)}
        />
      )}
    </div>
  );
}

export default App;
