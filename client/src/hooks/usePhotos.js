import { useCallback, useEffect, useRef, useState } from "react";
import { deletePhoto, getPhotos, uploadPhoto } from "../services/api";

const AUTO_REFRESH_INTERVAL_MS = 20000;

function getPhotosSnapshot(photos) {
  return JSON.stringify(
    photos.map((photo) => ({
      name: photo.name,
      status: photo.status,
      title: photo.title,
      summary: photo.summary,
      category: photo.category,
      section: photo.section,
      topic: photo.topic,
      tags: photo.tags,
      cleanText: photo.cleanText,
      textQuality: photo.textQuality,
      notes: photo.notes,
      error: photo.error,
      createdAt: photo.createdAt
    }))
  );
}

export function usePhotos(enabled = true, options = {}) {
  const { onPhotosChanged } = options;
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const photosRef = useRef([]);
  const photosSnapshotRef = useRef(getPhotosSnapshot([]));
  const loadingRef = useRef(false);
  const onPhotosChangedRef = useRef(onPhotosChanged);

  useEffect(() => {
    onPhotosChangedRef.current = onPhotosChanged;
  }, [onPhotosChanged]);

  const applyPhotos = useCallback((data) => {
    const nextPhotos = Array.isArray(data) ? data : [];
    const nextSnapshot = getPhotosSnapshot(nextPhotos);

    const changed = nextSnapshot !== photosSnapshotRef.current;

    if (changed) {
      photosSnapshotRef.current = nextSnapshot;
      photosRef.current = nextPhotos;
      setPhotos(nextPhotos);
    }

    return {
      changed,
      photos: nextPhotos
    };
  }, []);

  const loadPhotos = useCallback(async function loadPhotos(options = {}) {
    const { silent = false, notify = false } = options;

    if (!enabled) {
      photosRef.current = [];
      photosSnapshotRef.current = getPhotosSnapshot([]);
      setPhotos([]);
      setLoading(false);
      return [];
    }

    if (loadingRef.current) {
      return photosRef.current;
    }

    try {
      loadingRef.current = true;

      if (!silent) {
        setLoading(true);
      }

      const data = await getPhotos();
      const result = applyPhotos(data);

      if (notify && result.changed) {
        await onPhotosChangedRef.current?.();
      }

      return result.photos;
    } catch (error) {
      console.error("Ошибка загрузки списка фото:", error);

      if (!silent) {
        photosSnapshotRef.current = getPhotosSnapshot([]);
        setPhotos([]);
      }

      return [];
    } finally {
      loadingRef.current = false;

      if (!silent) {
        setLoading(false);
      }
    }
  }, [applyPhotos, enabled]);

  async function addPhoto(file, options = {}) {
    const { reload = true } = options;

    try {
      const uploadedPhoto = await uploadPhoto(file);

      if (reload) {
        await loadPhotos();
      }

      return uploadedPhoto;
    } catch (error) {
      console.error("Ошибка загрузки фото:", error);
      throw error;
    }
  }

  async function removePhoto(name) {
    try {
      await deletePhoto(name);
      await loadPhotos({ notify: true });
    } catch (error) {
      console.error("Ошибка удаления фото:", error);
    }
  }

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        loadPhotos({ silent: true, notify: true });
      }
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      loadPhotos({ silent: true, notify: true });
    }, AUTO_REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, loadPhotos]);

  return {
    photos,
    loading,
    addPhoto,
    removePhoto,
    reloadPhotos: loadPhotos
  };
}
