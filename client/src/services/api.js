import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

axios.defaults.withCredentials = true;

export function getCurrentUser() {
  return axios.get(`${API_URL}/api/me`).then((res) => res.data);
}

export function getAuthProviders() {
  return axios.get(`${API_URL}/api/auth-providers`).then((res) => res.data);
}

export function saveAnalyticsIdentity(identity) {
  return axios.post(`${API_URL}/api/analytics/identity`, identity).then((res) => res.data);
}

export async function loginWithProvider(providerId, acquisitionContext = {}) {
  if (!/^[a-z][a-z0-9_-]*$/.test(String(providerId || ""))) {
    return;
  }

  try {
    await axios.post(`${API_URL}/api/acquisition`, { context: acquisitionContext });
  } catch (error) {
    console.warn("Acquisition context was not saved before authentication:", error.message);
  }

  window.location.href = `${API_URL}/auth/${encodeURIComponent(providerId)}`;
}

export function requestEmailLoginCode(email, acquisitionContext = {}) {
  return axios.post(`${API_URL}/api/auth/email/request`, { email, acquisitionContext }).then((res) => res.data);
}

export function verifyEmailLoginCode({ email, code, legalVersion }) {
  return axios.post(`${API_URL}/api/auth/email/verify`, {
    email,
    code,
    legalAccepted: true,
    legalVersion
  }).then((res) => res.data);
}

export function logout() {
  window.location.href = `${API_URL}/logout`;
}

export function acceptLegalAgreement(version) {
  return axios.post(`${API_URL}/api/legal-agreement`, { version }).then((res) => res.data);
}

export function getGuestDocument() {
  return axios.get(`${API_URL}/api/guest/document`).then((res) => res.data);
}

export function retryGuestDocumentProcessing(id) {
  return axios
    .post(`${API_URL}/api/guest/documents/${encodeURIComponent(id)}/retry-processing`)
    .then((res) => res.data)
    .catch((error) => {
      if (error.response?.status === 409 && error.response.data?.error === "GUEST_LIMIT_REACHED") {
        throw new Error("Доступные обработки закончились.");
      }

      throw new Error("Не удалось повторить обработку. Попробуйте позже.");
    });
}

export function uploadGuestPhoto(file, options = {}) {
  const { onProgress, replaceDocumentId, uploadAttemptId = "", onDiagnostic } = options;
  const formData = new FormData();
  formData.append("photo", file);
  const startedAt = Date.now();
  let progressLogged = false;

  if (replaceDocumentId) {
    formData.append("replaceDocumentId", replaceDocumentId);
  }

  onDiagnostic?.("upload_request_started", {
    uploadAttemptId,
    preparedSizeBytes: file.size,
    mimeType: file.type
  });

  return axios
    .post(`${API_URL}/api/guest/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        "X-Upload-Attempt-ID": uploadAttemptId
      },
      onUploadProgress: (progressEvent) => {
        if (!progressLogged) {
          progressLogged = true;
          onDiagnostic?.("upload_progress_received", {
            uploadAttemptId,
            preparedSizeBytes: file.size,
            mimeType: file.type
          });
        }

        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      }
    })
    .then((res) => {
      onDiagnostic?.("upload_response_received", {
        uploadAttemptId,
        status: res.status,
        durationMs: Date.now() - startedAt,
        preparedSizeBytes: file.size,
        mimeType: file.type
      });
      return res.data;
    })
    .catch((err) => {
      onDiagnostic?.("upload_failed", {
        uploadAttemptId,
        stage: progressLogged ? "wait_response" : "upload_body",
        status: err.response?.status || 0,
        hasResponse: Boolean(err.response),
        durationMs: Date.now() - startedAt,
        preparedSizeBytes: file.size,
        mimeType: file.type,
        error: err
      });

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

export function createYookassaPayment({ packageId, packageTitle }) {
  return axios.post(`${API_URL}/api/payments/yookassa`, { packageId, packageTitle }).then((res) => res.data);
}

export function getAccessRequests() {
  return axios
    .get(`${API_URL}/api/access-requests`)
    .then((res) => res.data)
    .catch((err) => {
      if (err.response) {
        throw new Error("Ошибка загрузки заявок");
      }

      throw new Error("Сервер недоступен");
    });
}

export function getProcessingHistory() {
  return axios
    .get(`${API_URL}/api/processing-history`)
    .then((res) => res.data)
    .catch((err) => {
      if (err.response) {
        throw new Error("Ошибка загрузки истории обработок");
      }

      throw new Error("Сервер недоступен");
    });
}

export function getPhotoImprovementRequests(documentId) {
  return axios
    .get(`${API_URL}/api/photos/${encodeURIComponent(documentId)}/improvement-requests`)
    .then((res) => res.data);
}

export function getImprovementRequests() {
  return axios
    .get(`${API_URL}/api/improvement-requests`)
    .then((res) => res.data);
}

export function createImprovementRequest(documentId, payload) {
  return axios
    .post(`${API_URL}/api/photos/${encodeURIComponent(documentId)}/improvement-requests`, payload)
    .then((res) => res.data);
}
