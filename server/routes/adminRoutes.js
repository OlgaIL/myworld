import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { ADMIN_ENABLED, ADMIN_LOGIN, ADMIN_PASSWORD } from "../config/env.js";
import { listAccessRequestsForAdmin, updateAccessRequestStatus } from "../repositories/accessRequestsRepository.js";
import { findUserForAdmin, listUsersForAdmin, updateUserProductAccess } from "../repositories/usersRepository.js";

const router = Router();

function isAdminConfigured() {
  return ADMIN_ENABLED && ADMIN_LOGIN && ADMIN_PASSWORD;
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(req, res, next) {
  if (!isAdminConfigured()) {
    return res.status(404).json({ error: "ADMIN_DISABLED" });
  }

  if (!req.session?.adminAuthenticated) {
    return res.status(401).json({ error: "ADMIN_AUTH_REQUIRED" });
  }

  return next();
}

function mapAdminUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email || "",
    displayName: user.display_name || "",
    avatarUrl: user.avatar_url || "",
    processingEnabled: Boolean(user.processing_enabled),
    processingQuota: Number(user.processing_quota || 0),
    processingUsed: Number(user.processing_used || 0),
    recordsProcessedTotal: Number(user.records_processed_total || 0),
    processingMode: user.processing_mode || null,
    accessExpiresAt: user.access_expires_at || null,
    documentsCount: Number(user.documents_count || 0),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastDocumentAt: user.last_document_at || null
  };
}

function mapAdminAccessRequest(request) {
  return {
    id: request.id,
    userId: request.user_id,
    email: request.email || "",
    displayName: request.display_name || "",
    avatarUrl: request.avatar_url || "",
    message: request.message || "",
    status: request.status,
    documentsCount: Number(request.documents_count || 0),
    createdAt: request.created_at,
    updatedAt: request.updated_at
  };
}

router.post("/admin-api/login", (req, res) => {
  if (!isAdminConfigured()) {
    return res.status(404).json({ error: "ADMIN_DISABLED" });
  }

  const { login, password } = req.body || {};
  const loginMatches = safeCompare(login, ADMIN_LOGIN);
  const passwordMatches = safeCompare(password, ADMIN_PASSWORD);

  if (!loginMatches || !passwordMatches) {
    return res.status(401).json({ error: "INVALID_ADMIN_CREDENTIALS" });
  }

  req.session.adminAuthenticated = true;
  return res.json({ authenticated: true });
});

router.post("/admin-api/logout", requireAdmin, (req, res) => {
  req.session.adminAuthenticated = false;
  return res.json({ authenticated: false });
});

router.get("/admin-api/me", (req, res) => {
  if (!isAdminConfigured()) {
    return res.status(404).json({ error: "ADMIN_DISABLED" });
  }

  return res.json({ authenticated: Boolean(req.session?.adminAuthenticated) });
});

router.get("/admin-api/users", requireAdmin, async (req, res) => {
  const users = await listUsersForAdmin();
  return res.json(users.map(mapAdminUser));
});

router.get("/admin-api/access-requests", requireAdmin, async (req, res) => {
  const requests = await listAccessRequestsForAdmin();
  return res.json(requests.map(mapAdminAccessRequest));
});

router.patch("/admin-api/access-requests/:id/status", requireAdmin, async (req, res) => {
  const allowedStatuses = new Set(["new", "reviewed", "approved", "rejected"]);
  const status = String(req.body?.status || "");

  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ error: "INVALID_STATUS" });
  }

  const request = await updateAccessRequestStatus(req.params.id, status);

  if (!request) {
    return res.status(404).json({ error: "ACCESS_REQUEST_NOT_FOUND" });
  }

  const requests = await listAccessRequestsForAdmin();
  const updatedRequest = requests.find((item) => String(item.id) === String(request.id));
  return res.json(mapAdminAccessRequest(updatedRequest || request));
});

router.get("/admin-api/users/:id", requireAdmin, async (req, res) => {
  const user = await findUserForAdmin(req.params.id);

  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  return res.json(mapAdminUser(user));
});

router.patch("/admin-api/users/:id/processing-access", requireAdmin, async (req, res) => {
  const processingEnabled = Boolean(req.body?.processingEnabled);
  const processingQuota = Math.max(0, Number(req.body?.processingQuota || 0));
  const processingUsed = Math.max(0, Number(req.body?.processingUsed || 0));
  const accessExpiresAt = req.body?.accessExpiresAt || null;
  const user = await updateUserProductAccess(req.params.id, {
    processingEnabled,
    processingQuota,
    processingUsed,
    accessExpiresAt
  });

  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const adminUser = await findUserForAdmin(req.params.id);
  return res.json(mapAdminUser(adminUser));
});

export default router;
