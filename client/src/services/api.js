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

/*export function uploadPhoto(file) {
  const formData = new FormData();
  formData.append("photo", file);

  return axios.post(`${API_URL}/api/upload`, formData);
}*/


export function uploadPhoto(file, onProgress) {
  const formData = new FormData();
  formData.append("photo", file);

  return axios
    .post(`${API_URL}/api/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      },

      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percent);
        }
      }
    })
    .then(res => res.data)

    .catch(err => {

      if (err.response) {

        if (err.response.status === 413) {
          throw new Error("Файл слишком большой (макс 20MB)");
        }

        throw new Error("Ошибка загрузки файла");
      }

      throw new Error("Сервер недоступен");
    });
}




export function deletePhoto(name) {
  return axios.delete(`${API_URL}/api/photos/${name}`);
}

export function getPhotoUrl(name) {
  return `${API_URL}/api/photos/${name}`;
}
