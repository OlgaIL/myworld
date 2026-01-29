import axios from "axios";

// ✅ Если переменная окружения не задана — работаем локально
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

axios.defaults.withCredentials = true;

// ==================== AUTH ====================

export function getCurrentUser() {
  return axios.get(`${API_URL}/api/me`).then((res) => res.data);
}

export function loginWithGoogle() {
  window.location.href = `${API_URL}/auth/google`;
}

export function logout() {
  window.location.href = `${API_URL}/logout`;
}

// ==================== PHOTOS ====================

export function getPhotos() {
  return axios.get(`${API_URL}/api/photos`).then((res) => {
    const data = res.data;

    // ✅ Главное исправление: всегда возвращаем массив
    if (!Array.isArray(data)) {
      console.warn("getPhotos: сервер вернул не массив:", data);
      return [];
    }

    return data;
  });
}

export function uploadPhoto(file) {
  const formData = new FormData();
  formData.append("photo", file);

  return axios.post(`${API_URL}/api/upload`, formData);
}

export function deletePhoto(name) {
  return axios.delete(`${API_URL}/api/photos/${name}`);
}

export function getPhotoUrl(name) {
  return `${API_URL}/api/photos/${name}`;
}
