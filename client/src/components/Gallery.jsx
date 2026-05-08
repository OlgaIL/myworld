import { useCallback, useEffect, useState } from "react";
import PhotoCard from "./PhotoCard";
import { getPhotoInfo } from "../services/api";

function getPhotoListInfo(photo) {
  if (!photo?.status) {
    return null;
  }

  return {
    status: photo.status,
    title: photo.title || "",
    summary: photo.summary || "",
    category: photo.category || "",
    text: photo.text || "",
    cleanText: photo.cleanText || "",
    tags: Array.isArray(photo.tags) ? photo.tags : [],
    textQuality: photo.textQuality || "",
    notes: photo.notes || "",
    error: photo.error || null,
    createdAt: photo.createdAt || null
  };
}

function Gallery({ photos, pendingPhoto, onOpen, onOpenDocument, onDelete, uploadMessage = "" }) {
  const [infoMap, setInfoMap] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    async function hydratePhotoInfo() {
      const photosToRefresh = photos.filter((photo) => {
        const info = infoMap[photo.name] || getPhotoListInfo(photo);

        if (!info) {
          return true;
        }

        return info.status === "uploaded" || info.status === "processing";
      });

      if (photosToRefresh.length === 0) {
        return;
      }

      for (const photo of photosToRefresh) {
        try {
          const info = await getPhotoInfo(photo.name);

          if (cancelled) {
            return;
          }

          setInfoMap((prev) => ({
            ...prev,
            [photo.name]: {
              status: info.status,
              title: info.title || "",
              summary: info.summary || "",
              category: info.category || "",
              text: info.text || "",
              cleanText: info.cleanText || "",
              tags: Array.isArray(info.tags) ? info.tags : [],
              textQuality: info.textQuality || "",
              notes: info.notes || "",
              error: info.error || null,
              createdAt: info.createdAt || null
            }
          }));
        } catch (error) {
          if (cancelled) {
            return;
          }

          setInfoMap((prev) => ({
            ...prev,
            [photo.name]: {
              status: "error",
              error: error.message
            }
          }));
        }
      }
    }

    timeoutId = setTimeout(hydratePhotoInfo, 800);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [photos, infoMap]);

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    await onDelete(pendingDelete);
    setPendingDelete(null);
  }

  if (photos.length === 0 && !pendingPhoto) {
    return <p className="gallery__empty">Пока тут пусто. Загрузите ваши фото.</p>;
  }

  return (
    <>
      <section className="gallery">
        {pendingPhoto && (
          <PhotoCard
            key={pendingPhoto.name}
            photo={pendingPhoto}
            info={null}
            uploadMessage={uploadMessage}
            onOpen={onOpen}
            onOpenDocument={onOpenDocument}
            onRequestDelete={setPendingDelete}
          />
        )}

        {photos.map((photo) => (
          <PhotoCard
            key={photo.name}
            photo={photo}
            info={infoMap[photo.name] || getPhotoListInfo(photo)}
            onOpen={onOpen}
            onOpenDocument={onOpenDocument}
            onRequestDelete={setPendingDelete}
          />
        ))}
      </section>

      {pendingDelete && (
        <div className="confirm-modal" onClick={() => setPendingDelete(null)}>
          <div className="confirm-modal__content" onClick={(event) => event.stopPropagation()}>
            <h3 className="confirm-modal__title">Удалить фото?</h3>
            <p className="confirm-modal__text">Это действие нельзя отменить.</p>
            <div className="confirm-modal__actions">
              <button
                type="button"
                className="confirm-modal__button confirm-modal__button--secondary"
                onClick={() => setPendingDelete(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="confirm-modal__button confirm-modal__button--danger"
                onClick={confirmDelete}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Gallery;
