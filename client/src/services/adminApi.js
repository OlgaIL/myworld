import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

axios.defaults.withCredentials = true;

export function getAdminSession() {
  return axios.get(`${API_URL}/admin-api/me`).then((res) => res.data);
}

export function loginAdmin({ login, password }) {
  return axios.post(`${API_URL}/admin-api/login`, { login, password }).then((res) => res.data);
}

export function logoutAdmin() {
  return axios.post(`${API_URL}/admin-api/logout`).then((res) => res.data);
}

export function getAdminUsers() {
  return axios.get(`${API_URL}/admin-api/users`).then((res) => res.data);
}

export function getAdminAccessRequests() {
  return axios.get(`${API_URL}/admin-api/access-requests`).then((res) => res.data);
}

export function getAdminProcessingCredits() {
  return axios.get(`${API_URL}/admin-api/processing-credits`).then((res) => res.data);
}

export function getAdminImprovementRequests() {
  return axios.get(`${API_URL}/admin-api/improvement-requests`).then((res) => res.data);
}

export function getAdminImprovementRequest(id) {
  return axios.get(`${API_URL}/admin-api/improvement-requests/${id}`).then((res) => res.data);
}

export function getAdminImprovementRequestImageUrl(id) {
  return `${API_URL}/admin-api/improvement-requests/${encodeURIComponent(id)}/file`;
}

export function updateAdminImprovementRequestStatus(id, status) {
  return axios
    .patch(`${API_URL}/admin-api/improvement-requests/${id}/status`, { status })
    .then((res) => res.data);
}

export function completeAdminImprovementRequest(id, result) {
  return axios
    .patch(`${API_URL}/admin-api/improvement-requests/${id}/result`, result)
    .then((res) => res.data);
}

export function getAdminSettings() {
  return axios.get(`${API_URL}/admin-api/settings`).then((res) => res.data);
}

export function getAdminUser(id) {
  return axios.get(`${API_URL}/admin-api/users/${id}`).then((res) => res.data);
}

export function updateAdminUserProcessingAccess(id, access) {
  return axios.patch(`${API_URL}/admin-api/users/${id}/processing-access`, access).then((res) => res.data);
}

export function createAdminManualProcessingCredit(id, credit) {
  return axios.post(`${API_URL}/admin-api/users/${id}/processing-credits`, credit).then((res) => res.data);
}

export function updateAdminAccessRequestStatus(id, status) {
  return axios.patch(`${API_URL}/admin-api/access-requests/${id}/status`, { status }).then((res) => res.data);
}
