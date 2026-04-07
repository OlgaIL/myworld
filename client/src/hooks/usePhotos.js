import { useEffect, useState } from "react";
import {
  getPhotos,
  uploadPhoto,
  deletePhoto,
  processPhoto,
  getPhotoInfo,
  getPhotoUrl,
} from "../services/api";

export function usePhotos() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  // ------------------ Загрузка списка ------------------
  async function loadPhotos() {
    try {
      setLoading(true);
      const data = await getPhotos();

      // приводим к объектам с id, url, status
      const mapped = Array.isArray(data)
        ? data.map((name) => ({
            id: name,
            name,
            url: getPhotoUrl(name),
            status: "uploaded",
            title: "",
            summary: "",
            tags: [],
            error: null,
          }))
        : [];

      setPhotos(mapped);
    } catch (err) {
      console.error("Ошибка загрузки списка фото:", err);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  // ------------------ Добавление фото ------------------
  async function addPhoto(file) {
    try {
      const uploaded = await uploadPhoto(file);

      // создаём объект с статусом processing
      const newPhoto = {
        id: uploaded.id, // совпадает с filename
        name: uploaded.filename,
        url: getPhotoUrl(uploaded.id),
        status: "processing",
        title: "",
        summary: "",
        tags: [],
        error: null,
      };

      setPhotos((prev) => [newPhoto, ...prev]);

      // запускаем обработку асинхронно
      processAndUpdate(newPhoto);
    } catch (err) {
      console.error("Ошибка загрузки фото:", err);
      throw err;
    }
  }

  // ------------------ Удаление фото ------------------
  async function removePhoto(name) {
    try {
      await deletePhoto(name);
      setPhotos((prev) => prev.filter((p) => p.name !== name));
    } catch (err) {
      console.error("Ошибка удаления фото:", err);
    }
  }

  // ------------------ Обработка фото ------------------
  async function processAndUpdate(photo) {
    try {
      await processPhoto(photo.id);
      const info = await getPhotoInfo(photo.id);

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                status: info.status,
                title: info.title || "",
                summary: info.summary || "",
                tags: Array.isArray(info.tags) ? info.tags : [],
                error: info.error || null,
              }
            : p
        )
      );
    } catch (err) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? { ...p, status: "error", error: err.message }
            : p
        )
      );
    }
  }

  // ------------------ Повтор обработки ------------------
  function retryProcess(photo) {
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photo.id ? { ...p, status: "processing", error: null } : p
      )
    );
    processAndUpdate(photo);
  }

  // ------------------ useEffect ------------------
  useEffect(() => {
    loadPhotos();
  }, []);

  return {
    photos,
    loading,
    addPhoto,
    removePhoto,
    retryProcess,
  };
}