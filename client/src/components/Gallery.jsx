import { useCallback, useEffect, useMemo, useState } from "react";
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
    section: photo.section || "",
    topic: photo.topic || "",
    text: photo.text || "",
    cleanText: photo.cleanText || "",
    tags: Array.isArray(photo.tags) ? photo.tags : [],
    textQuality: photo.textQuality || "",
    notes: photo.notes || "",
    error: photo.error || null,
    createdAt: photo.createdAt || null
  };
}

function Gallery({ photos, pendingPhoto, pendingPhotos = [], onOpen, onOpenDocument, onDelete, uploadMessage = "", emptyMessage = "Пока тут пусто. Загрузите ваши фото.", onSelectCategory, onSelectTag }) {
  const [infoMap, setInfoMap] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const pendingQueue = pendingPhotos.length > 0 ? pendingPhotos : (pendingPhoto ? [pendingPhoto] : []);
  const visiblePhotos = useMemo(() => {
    const pendingServerNames = new Set(pendingQueue.map((photo) => photo.serverName).filter(Boolean));
    return photos.filter((photo) => !pendingServerNames.has(photo.name));
  }, [pendingQueue, photos]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    async function hydratePhotoInfo() {
      const photosToRefresh = visiblePhotos.filter((photo) => {
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
              section: info.section || "",
              topic: info.topic || "",
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
  }, [visiblePhotos, infoMap]);

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    await onDelete(pendingDelete);
    setPendingDelete(null);
  }

  if (visiblePhotos.length === 0 && pendingQueue.length === 0) {
    return <p className="gallery__empty">{emptyMessage}</p>;
  }

  return (
    <>
      <section className="gallery">
        {pendingQueue.map((photo) => (
          <PhotoCard
            key={photo.name}
            photo={photo}
            info={null}
            uploadMessage={photo.uploadMessage || uploadMessage}
            onOpen={onOpen}
            onOpenDocument={onOpenDocument}
            onRequestDelete={setPendingDelete}
            onSelectCategory={onSelectCategory}
            onSelectTag={onSelectTag}
          />
        ))}

        {visiblePhotos.map((photo) => (
          <PhotoCard
            key={photo.name}
            photo={photo}
            info={infoMap[photo.name] || getPhotoListInfo(photo)}
            onOpen={onOpen}
            onOpenDocument={onOpenDocument}
            onRequestDelete={setPendingDelete}
            onSelectCategory={onSelectCategory}
            onSelectTag={onSelectTag}
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
