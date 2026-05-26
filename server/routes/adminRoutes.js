import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { ADMIN_ENABLED, ADMIN_LOGIN, ADMIN_PASSWORD } from "../config/env.js";
import { findUserForAdmin, listUsersForAdmin, updateUserProcessingAccess } from "../repositories/usersRepository.js";

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
    documentsCount: Number(user.documents_count || 0),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastDocumentAt: user.last_document_at || null
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
  const user = await updateUserProcessingAccess(req.params.id, {
    processingEnabled,
    processingQuota,
    processingUsed
  });

  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const adminUser = await findUserForAdmin(req.params.id);
  return res.json(mapAdminUser(adminUser));
});

export default router;
