import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePhotos } from "../hooks/usePhotos";
import { getPhotoUrl } from "../services/api";
import Gallery from "../components/Gallery";
import Modal from "../components/Modal";



function App() {
  const { user, login, logout } = useAuth();
  const { photos, loading, addPhoto, removePhoto } = usePhotos();
  
  const [activePhoto, setActivePhoto] = useState(null);

  // ✅ состояние загрузки файла
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);

      // ✅ ждём пока загрузка завершится
      await addPhoto(file);

      // очищаем input чтобы можно было загрузить тот же файл снова
      e.target.value = "";
    } catch (err) {
      console.error("Ошибка загрузки:", err);
      alert("Не удалось загрузить фото");
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

          {/* ✅ Загрузка файла */}
          <input type="file" onChange={handleUpload} disabled={uploading} />

          {/* ✅ Индикатор */}
          {uploading && (
            <p style={{ marginTop: "10px" }}>Загрузка фото...</p>
          )}

          {/* ✅ Gallery показываем только если массив */}
          {Array.isArray(photos) && photos.length > 0 ? (
            <Gallery
              photos={photos}
              onOpen={setActivePhoto}
              onDelete={removePhoto}
            />
          ) : (
            <p style={{ marginTop: "20px" }}>
              Пока нет загруженных фотографий
            </p>
          )}
        </>
      )}

      {/* ✅ Модалка */}
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
