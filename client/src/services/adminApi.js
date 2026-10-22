import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

axios.defaults.withCredentials = true;

export function getOcrReviewCases() {
  return axios.get(`${API_URL}/admin-api/ocr-review/cases`).then((res) => res.data);
}
export function getOcrReviewImageUrl(id) {
  return `${API_URL}/admin-api/ocr-review/cases/${encodeURIComponent(id)}/file`;
}
export function processOcrReviewCase(id, { token, runId, audience }) {
  return axios.post(`${API_URL}/admin-api/ocr-review/cases/${encodeURIComponent(id)}/process`,
    { runId, audience }, { headers: { "X-Ocr-Review-Token": token } }).then((res) => res.data);
}
export function restoreOcrReviewTables(id, { token, runId }) {
  return axios.post(`${API_URL}/admin-api/ocr-review/cases/${encodeURIComponent(id)}/tables`,
    { runId }, { headers: { "X-Ocr-Review-Token": token } }).then((res) => res.data.info);
}

export function getAdminSession() {
  return axios.get(`${API_URL}/admin-api/me`).then((res) => res.data);
}

export function loginAdmin({ login, password }) {
  return axios.post(`${API_URL}/admin-api/login`, { login, password }).then((res) => res.data);
}

export function logoutAdmin() {
  return axios.post(`${API_URL}/admin-api/logout`).then((res) => res.data);
}

export function getAdminUsers(filters = {}) {
  return axios.get(`${API_URL}/admin-api/users`, { params: filters }).then((res) => res.data);
}

export function getAdminUsersSummary() {
  return axios.get(`${API_URL}/admin-api/users-summary`).then((res) => res.data);
}

export function getAdminPresence() {
  return axios.get(`${API_URL}/admin-api/presence`).then((res) => res.data);
}

export function getAdminLlmAttempts(hours = 24) {
  return axios.get(`${API_URL}/admin-api/llm-attempts`, { params: { hours } }).then((res) => res.data);
}

export function getAdminGuestStorage(hours = 24) {
  return axios.get(`${API_URL}/admin-api/guest-storage`, { params: { hours } }).then((res) => res.data);
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

export function deleteAdminAccount(id, confirmationId, csrfToken) {
  return axios.delete(`${API_URL}/admin-api/users/${encodeURIComponent(id)}`, {
    data: { confirmationId }, headers: { "X-Admin-Deletion-CSRF": csrfToken }
  }).then((res) => res.data);
}

export function getAdminAccountDeletion(jobId) {
  return axios.get(`${API_URL}/admin-api/account-deletions/${encodeURIComponent(jobId)}`).then((res) => res.data);
}

export function retryAdminAccountDeletion(jobId, csrfToken) {
  return axios.post(`${API_URL}/admin-api/account-deletions/${encodeURIComponent(jobId)}/retry`, {}, {
    headers: { "X-Admin-Deletion-CSRF": csrfToken }
  }).then((res) => res.data);
}

export function updateAdminUserProcessingAccess(id, access) {
  return axios.patch(`${API_URL}/admin-api/users/${id}/processing-access`, access).then((res) => res.data);
}

export function createAdminManualProcessingCredit(id, credit) {
  return axios.post(`${API_URL}/admin-api/users/${id}/processing-credits`, credit).then((res) => res.data);
}

export function createAdminGift(id, gift, csrfToken) {
  return axios.post(`${API_URL}/admin-api/users/${id}/gifts`, gift,
    { headers: { "X-Admin-Gift-CSRF": csrfToken } }).then(res => res.data);
}

export function updateAdminAccessRequestStatus(id, status) {
  return axios.patch(`${API_URL}/admin-api/access-requests/${id}/status`, { status }).then((res) => res.data);
}
