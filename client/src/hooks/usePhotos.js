import { useEffect, useState } from "react";
import { getPhotos, uploadPhoto, deletePhoto } from "../services/api";

export function usePhotos() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  

  // ✅ Загружаем фото правильно
  async function loadPhotos() {
    try {
      setLoading(true);

      const data = await getPhotos();

      // защита: если сервер вернул не массив
      setPhotos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Ошибка загрузки списка фото:", err);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  // ✅ Добавляем фото и ждём обновления списка
  async function addPhoto(file) {
    try {
      await uploadPhoto(file);
      await loadPhotos();
    } catch (err) {
      console.error("Ошибка загрузки фото:", err);
      throw err;
    }
  }

  // ✅ Удаляем фото и обновляем список
  async function removePhoto(name) {
    try {
      await deletePhoto(name);
      await loadPhotos();
    } catch (err) {
      console.error("Ошибка удаления фото:", err);
    }
  }

  useEffect(() => {
    loadPhotos();
  }, []);

  return {
    photos,
    loading,
    addPhoto,
    removePhoto
  };
}
