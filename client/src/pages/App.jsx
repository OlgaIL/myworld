import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePhotos } from "../hooks/usePhotos";
import { getPhotoUrl } from "../services/api";
import Gallery from "../components/Gallery";
import Modal from "../components/Modal";

function App() {
  const { user, login, logout } = useAuth();
  const { photos, addPhoto, removePhoto } = usePhotos();
  const [activePhoto, setActivePhoto] = useState(null);

  function handleUpload(e) {
    addPhoto(e.target.files[0]);
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

          <input type="file" onChange={handleUpload} />

          <Gallery
            photos={photos}
            onOpen={setActivePhoto}
            onDelete={removePhoto}
          />
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
