import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

axios.defaults.withCredentials = true;

export function getCurrentUser() {
  return axios.get(`${API_URL}/api/me`).then((res) => res.data);
}

export function loginWithGoogle() {
  window.location.href = `${API_URL}/auth/google`;
}

export function loginWithYandex() {
  window.location.href = `${API_URL}/auth/yandex`;
}

export function logout() {
  window.location.href = `${API_URL}/logout`;
}

export function getGuestDocument() {
  return axios.get(`${API_URL}/api/guest/document`).then((res) => res.data);
}

export function uploadGuestPhoto(file, options = {}) {
  const { onProgress, replaceDocumentId } = options;
  const formData = new FormData();
  formData.append("photo", file);

  if (replaceDocumentId) {
    formData.append("replaceDocumentId", replaceDocumentId);
  }

  return axios
    .post(`${API_URL}/api/guest/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      }
    })
    .then((res) => res.data)
    .catch((err) => {
      if (err.response) {
        if (err.response.status === 409 && err.response.data?.error === "GUEST_LIMIT_REACHED") {
          throw new Error("GUEST_LIMIT_REACHED");
        }

        if (err.response.status === 413) {
          throw new Error("Файл слишком большой (макс 10MB)");
        }

        if (err.response.status === 409 && err.response.data?.error === "USER_RECORD_LIMIT_REACHED") {
          throw new Error("USER_RECORD_LIMIT_REACHED");
        }

        throw new Error("Ошибка загрузки файла");
      }

      throw new Error("Сервер недоступен");
    });
}

export function getGuestDocumentFileUrl(id, version = "") {
  const cacheKey = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${API_URL}/api/guest/documents/${id}/file${cacheKey}`;
}

export function getPhotos() {
  return axios.get(`${API_URL}/api/photos-metadata`).then((res) => {
    const data = res.data;

    if (!Array.isArray(data)) {
      console.warn("getPhotos: сервер вернул не массив:", data);
      return [];
    }

    return data
      .map((item) => {
        if (typeof item === "string") {
          return {
            name: item,
            url: getPhotoUrl(item)
          };
        }

        if (item && typeof item === "object" && (typeof item.name === "string" || typeof item.filename === "string")) {
          const name = item.name || item.filename;

          return {
            ...item,
            name,
            url: item.url || getPhotoUrl(name)
          };
        }

        return null;
      })
      .filter(Boolean);
  });
}

export function uploadPhoto(file, onProgress) {
  const formData = new FormData();
  formData.append("photo", file);

  return axios
    .post(`${API_URL}/api/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      }
    })
    .then((res) => res.data)
    .catch((err) => {
      if (err.response) {
        if (err.response.status === 413) {
          throw new Error("Файл слишком большой (макс 10MB)");
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

export function processPhoto(id) {
  return axios
    .post(`${API_URL}/api/photos/${id}/process`)
    .then((res) => res.data)
    .catch((err) => {
      if (err.response) {
        throw new Error("Ошибка запуска обработки");
      }

      throw new Error("Сервер недоступен");
    });
}

export function getPhotoInfo(id) {
  return axios
    .get(`${API_URL}/api/photos/${id}/info`)
    .then((res) => res.data)
    .catch((err) => {
      if (err.response) {
        throw new Error("Ошибка получения информации");
      }

      throw new Error("Сервер недоступен");
    });
}

export function createAccessRequest({ message }) {
  return axios
    .post(`${API_URL}/api/access-requests`, { message })
    .then((res) => res.data)
    .catch((err) => {
      if (err.response) {
        throw new Error("Не удалось отправить заявку");
      }

      throw new Error("Сервер недоступен");
    });
}
