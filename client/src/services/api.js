import axios from "axios";

//const API_URL = "http://localhost:4000";

const API_URL = import.meta.env.VITE_API_URL

axios.defaults.withCredentials = true;

export function getCurrentUser() {
  return axios.get(`${API_URL}/api/me`).then(res => res.data);
}

export function loginWithGoogle() {
  window.location.href = `${API_URL}/auth/google`;
}

export function logout() {
  window.location.href = `${API_URL}/logout`;
}

export function getPhotos() {
  return axios.get(`${API_URL}/api/photos`).then(res => res.data);
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
