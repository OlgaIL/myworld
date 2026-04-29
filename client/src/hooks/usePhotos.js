import { useEffect, useState } from "react";
import { deletePhoto, getPhotos, uploadPhoto } from "../services/api";

export function usePhotos(enabled = true) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(enabled);

  async function loadPhotos() {
    if (!enabled) {
      setPhotos([]);
      setLoading(false);
      return [];
    }

    try {
      setLoading(true);
      const data = await getPhotos();
      setPhotos(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Ошибка загрузки списка фото:", error);
      setPhotos([]);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function addPhoto(file) {
    try {
      const uploadedPhoto = await uploadPhoto(file);
      await loadPhotos();
      return uploadedPhoto;
    } catch (error) {
      console.error("Ошибка загрузки фото:", error);
      throw error;
    }
  }

  async function removePhoto(name) {
    try {
      await deletePhoto(name);
      await loadPhotos();
    } catch (error) {
      console.error("Ошибка удаления фото:", error);
    }
  }

  useEffect(() => {
    loadPhotos();
  }, [enabled]);

  return {
    photos,
    loading,
    addPhoto,
    removePhoto,
    reloadPhotos: loadPhotos
  };
}
