import { useCallback, useEffect, useRef, useState } from "react";
import { deletePhoto, deletePhotos, getPhotos, uploadPhoto } from "../services/api";

const AUTO_REFRESH_INTERVAL_MS = 20000;

function getPhotosSnapshot(photos) {
  return JSON.stringify(
    photos.map((photo) => ({
      name: photo.name,
      status: photo.status,
      title: photo.title,
      displayTitle: photo.displayTitle,
      summary: photo.summary,
      category: photo.category,
      section: photo.section,
      topic: photo.topic,
      tags: photo.tags,
      cleanText: photo.cleanText,
      textQuality: photo.textQuality,
      notes: photo.notes,
      formattedContent: photo.formattedContent,
      formattedAt: photo.formattedAt,
      hasTable: photo.hasTable,
      tableStatus: photo.tableStatus,
      tableAttempts: photo.tableAttempts,
      tableErrorCode: photo.tableErrorCode,
      tableRetryable: photo.tableRetryable,
      tableFailureKind: photo.tableFailureKind,
      tableNextAction: photo.tableNextAction,
      tableRetryAfter: photo.tableRetryAfter,
      hasFormulas: photo.hasFormulas,
      hasRecognitionErrors: photo.hasRecognitionErrors,
      corrections: photo.corrections,
      error: photo.error,
      createdAt: photo.createdAt
    }))
  );
}

export function usePhotos(enabled = true, options = {}) {
  const { onPhotosChanged, ownerKey = "account" } = options;
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const photosRef = useRef([]);
  const photosSnapshotRef = useRef(getPhotosSnapshot([]));
  const loadingRef = useRef(null);
  const removedNamesRef = useRef(new Set());
  const generationRef = useRef(0);
  const onPhotosChangedRef = useRef(onPhotosChanged);

  useEffect(() => {
    onPhotosChangedRef.current = onPhotosChanged;
  }, [onPhotosChanged]);

  const applyPhotos = useCallback((data) => {
    const nextPhotos = Array.isArray(data) ? data.filter(photo => !removedNamesRef.current.has(photo.name)) : [];
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
      removedNamesRef.current.clear();
      photosRef.current = [];
      photosSnapshotRef.current = getPhotosSnapshot([]);
      setPhotos([]);
      setLoading(false);
      return [];
    }

    const generation = generationRef.current;
    if (loadingRef.current === generation) {
      return photosRef.current;
    }

    try {
      loadingRef.current = generation;

      if (!silent) {
        setLoading(true);
      }

      const data = await getPhotos();
      if (generation !== generationRef.current) return photosRef.current;
      const result = applyPhotos(data);

      if (notify && result.changed) {
        await onPhotosChangedRef.current?.();
      }

      return result.photos;
    } catch (error) {
      console.error("Ошибка загрузки списка фото:", error);

      if (generation !== generationRef.current) return photosRef.current;
      if (!silent) applyPhotos([]);

      return [];
    } finally {
      if (loadingRef.current === generation) loadingRef.current = null;
      if (!silent && generation === generationRef.current) {
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

  function applyDeletion(result) {
    for (const name of [...(result.deleted || []), ...(result.missing || [])]) removedNamesRef.current.add(name);
    applyPhotos(photosRef.current);
  }

  async function refreshAfterDeletion() {
    await loadPhotos({ silent: true });
    // A profile-refresh failure must not turn a committed deletion into an
    // apparent failure. Payments and processing credits are never modified.
    try { await onPhotosChangedRef.current?.(); }
    catch (error) { console.error("Ошибка обновления кабинета:", error); }
  }

  async function removePhoto(name) {
    const generation = generationRef.current;
    try {
      const result = await deletePhoto(name);
      if (generation !== generationRef.current) return result;
      applyDeletion(result);
      await refreshAfterDeletion();
      return result;
    } catch (error) {
      if (generation !== generationRef.current) throw error;
      // A second tab may have already deleted this exact record.
      if (error.response?.status === 404) {
        const result = { deleted: [], missing: [name] };
        applyDeletion(result);
        return result;
      }
      await loadPhotos({ silent: true });
      throw error;
    }
  }

  async function removePhotos(names, onProgress = () => {}) {
    const generation = generationRef.current;
    const snapshot = [...new Set(names)];
    const outcome = { deleted: [], missing: [], failed: [], cleanupPending: false };
    for (let offset = 0; offset < snapshot.length; offset += 100) {
      if (generation !== generationRef.current) break;
      const batch = snapshot.slice(offset, offset + 100);
      try {
        const result = await deletePhotos(batch);
        if (generation !== generationRef.current) break;
        // Only acknowledge names explicitly included in this request.
        const targets = new Set(batch);
        const confirmed = {
          deleted: (result.deleted || []).filter(name => targets.has(name)),
          missing: (result.missing || []).filter(name => targets.has(name))
        };
        outcome.deleted.push(...confirmed.deleted);
        outcome.missing.push(...confirmed.missing);
        outcome.failed.push(...(result.failed || []));
        outcome.cleanupPending ||= Boolean(result.cleanupPending);
        applyDeletion(confirmed);
        onProgress(Math.min(offset + batch.length, snapshot.length));
      } catch (error) {
        outcome.failureCode = error.response?.data?.error || "DELETE_CONFIRMATION_UNAVAILABLE";
        // Stop instead of sending more destructive requests after losing the
        // acknowledgement. Earlier confirmed chunks remain successful.
        break;
      }
    }
    if (generation === generationRef.current) await refreshAfterDeletion();
    return outcome;
  }

  useEffect(() => {
    generationRef.current += 1;
    removedNamesRef.current.clear();
    applyPhotos([]);
    loadPhotos();
    return () => { generationRef.current += 1; };
  }, [loadPhotos, applyPhotos, ownerKey]);

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
    removePhotos,
    reloadPhotos: loadPhotos
  };
}
