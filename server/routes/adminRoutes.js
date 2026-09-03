import { Router } from "express";
import { timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import {
  ADMIN_ENABLED,
  ADMIN_LOGIN,
  ADMIN_PASSWORD,
  AUTH_PROVIDERS,
  GOOGLE_OCR_ENABLED,
  GUEST_DOCUMENT_LIMIT,
  GUEST_DOCUMENT_TTL_HOURS,
  OPENAI_ENABLED,
  OPENAI_MODEL,
  PROCESSING_ALLOWLIST_EMAILS,
  PROCESSING_ENABLED,
  PROCESSING_FREE_MODE,
  PROCESSING_GUEST_MODE,
  PROCESSING_MODE_OVERRIDE,
  PROCESSING_PAID_MODE,
  PROCESSING_STANDARD_AI_PROVIDER,
  PROCESSING_STANDARD_OCR_PROVIDER,
  YOOKASSA_ENABLED,
  YANDEX_AI_ENABLED,
  YANDEX_GPT_MODEL_URI,
  YANDEX_METRIKA_API_ENABLED,
  YANDEX_METRIKA_COUNTER_ID,
  YANDEX_METRIKA_VISITS_START_DATE,
  YANDEX_OCR_ENABLED,
  YANDEX_OCR_LANGUAGE_CODES,
  YANDEX_OCR_MODEL,
  isAuthProviderEnabled
} from "../config/env.js";
import { DEFAULT_FREE_PROCESSING_LIMIT } from "../config/processingLimits.js";
import {
  GOOGLE_APPLICATION_CREDENTIALS,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  MTS_CLIENT_ID,
  MTS_CLIENT_SECRET,
  OPENAI_API_KEY,
  SBER_CLIENT_ID,
  SBER_CLIENT_SECRET,
  VK_CLIENT_ID,
  VK_CLIENT_SECRET,
  YOOKASSA_SECRET_KEY,
  YOOKASSA_SHOP_ID,
  YANDEX_API_KEY,
  YANDEX_CLIENT_ID,
  YANDEX_CLIENT_SECRET,
  YANDEX_FOLDER_ID,
  YANDEX_METRIKA_API_TOKEN
} from "../config/private-env.js";
import { listAccessRequestsForAdmin, updateAccessRequestStatus } from "../repositories/accessRequestsRepository.js";
import {
  completeImprovementRequestForAdmin,
  findImprovementRequestForAdmin,
  listImprovementRequestsForAdmin,
  updateImprovementRequestStatusForAdmin
} from "../repositories/improvementRequestsRepository.js";
import { grantManualProcessingCredit, listProcessingCreditEventsForAdmin } from "../repositories/paymentsRepository.js";
import { findUserForAdmin, listUsersForAdmin, updateUserProductAccess } from "../repositories/usersRepository.js";
import { getProcessingPipelineForUser } from "../services/processingPipelineService.js";
import { getMetrikaVisitsByClientIds } from "../services/metrikaService.js";
import { isAuthProviderConfigured } from "../auth/providers.js";

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

function getUserAuthProviders(user) {
  return [
    user.google_id && "Google",
    user.yandex_id && "Яндекс",
    user.vk_id && "VK ID",
    user.sber_id && "Сбер ID",
    user.mts_id && "МТС ID",
    user.email_verified_at && "Email"
  ].filter(Boolean);
}

function mapAdminUser(user, { metrikaVisits = null } = {}) {
  if (!user) {
    return null;
  }

  const metrikaClientId = user.metrika_client_id || "";
  const visitsStatus = metrikaClientId ? metrikaVisits?.status || "unavailable" : "no_client_id";
  const visitsCount = visitsStatus === "ok"
    ? Number(metrikaVisits?.visitsByClientId?.[metrikaClientId] || 0)
    : null;

  return {
    id: user.id,
    email: user.email || "",
    displayName: user.display_name || "",
    avatarUrl: user.avatar_url || "",
    authProviders: getUserAuthProviders(user),
    processingEnabled: Boolean(user.processing_enabled),
    processingQuota: Number(user.processing_quota || 0),
    processingUsed: Number(user.processing_used || 0),
    recordsProcessedTotal: Number(user.records_processed_total || 0),
    lastProcessingAt: user.last_processing_at || null,
    firstDeviceType: user.first_device_type || "",
    firstDeviceOs: user.first_device_os || "",
    firstDeviceBrowser: user.first_device_browser || "",
    metrikaClientId,
    metrikaVisitsCount: visitsCount,
    metrikaVisitsStatus: visitsStatus,
    metrikaVisitsPeriodStart: metrikaVisits?.periodStart || YANDEX_METRIKA_VISITS_START_DATE,
    documentsCreatedTotal: Number(user.documents_created_total || 0),
    documentsDeletedTotal: Number(user.documents_deleted_total || 0),
    documentsHistoryComplete: Boolean(user.documents_history_complete),
    recordLimit: Number(user.free_processing_limit || 0),
    processingMode: user.processing_mode || null,
    accessExpiresAt: user.access_expires_at || null,
    acquisitionContext: user.acquisition_context || null,
    acquisitionCapturedAt: user.acquisition_captured_at || null,
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

function mapAdminProcessingCreditEvent(event) {
  return {
    id: event.id,
    userId: event.user_id,
    email: event.email || "",
    displayName: event.display_name || "",
    source: event.source,
    packageTitle: event.package_title || "",
    amount: Number(event.amount || 0),
    note: event.note || "",
    createdBy: event.created_by || "",
    createdAt: event.created_at,
    paymentId: event.payment_id || null,
    providerPaymentId: event.provider_payment_id || "",
    amountValue: event.amount_value === null || event.amount_value === undefined ? null : Number(event.amount_value),
    currency: event.currency || "",
    paymentStatus: event.payment_status || ""
  };
}

function mapAdminImprovementRequest(request, { includeDocument = false } = {}) {
  const mapped = {
    id: String(request.id),
    userId: request.user_id,
    email: request.email || "",
    displayName: request.display_name || "",
    documentId: request.filename,
    documentTitle: request.title || "Запись",
    documentStatus: request.photo_status,
    textQuality: request.text_quality || "",
    status: request.status,
    comment: request.user_comment || "",
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    startedAt: request.started_at,
    completedAt: request.completed_at,
    viewedAt: request.viewed_at
  };

  if (!includeDocument) {
    return mapped;
  }

  return {
    ...mapped,
    mimeType: request.mime_type || "",
    ocrText: request.ocr_text || "",
    cleanText: request.clean_text || "",
    summary: request.summary || "",
    notes: request.ai_notes || "",
    originalOcrText: request.original_ocr_text || request.ocr_text || "",
    originalCleanText: request.original_clean_text || request.clean_text || "",
    improvedText: request.improved_text || "",
    adminComment: request.admin_comment || "",
    documentCreatedAt: request.photo_created_at,
    imageUrl: `/admin-api/improvement-requests/${request.id}/file`
  };
}

function getAuthProviderSettings() {
  return [
    {
      id: "google",
      label: "Google",
      enabled: isAuthProviderEnabled("google"),
      configured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
    },
    {
      id: "yandex",
      label: "Яндекс",
      enabled: isAuthProviderEnabled("yandex"),
      configured: Boolean(YANDEX_CLIENT_ID && YANDEX_CLIENT_SECRET)
    },
    {
      id: "vk",
      label: "VK ID",
      enabled: isAuthProviderEnabled("vk"),
      configured: Boolean(VK_CLIENT_ID && VK_CLIENT_SECRET)
    },
    {
      id: "sber",
      label: "Сбер ID",
      enabled: isAuthProviderEnabled("sber"),
      configured: Boolean(SBER_CLIENT_ID && SBER_CLIENT_SECRET)
    },
    {
      id: "mts",
      label: "МТС ID",
      enabled: isAuthProviderEnabled("mts"),
      configured: Boolean(MTS_CLIENT_ID && MTS_CLIENT_SECRET)
    },
    {
      id: "email",
      label: "Email",
      enabled: isAuthProviderEnabled("email"),
      configured: isAuthProviderConfigured("email")
    }
  ];
}

function getAdminSettings() {
  return {
    auth: {
      providersFromEnv: AUTH_PROVIDERS,
      providers: getAuthProviderSettings()
    },
    processing: {
      enabled: PROCESSING_ENABLED,
      modeOverride: PROCESSING_MODE_OVERRIDE,
      guestMode: PROCESSING_GUEST_MODE,
      freeMode: PROCESSING_FREE_MODE,
      paidMode: PROCESSING_PAID_MODE,
      standardOcrProvider: PROCESSING_STANDARD_OCR_PROVIDER,
      standardAiProvider: PROCESSING_STANDARD_AI_PROVIDER,
      allowlistEnabled: PROCESSING_ALLOWLIST_EMAILS.length > 0,
      allowlistCount: PROCESSING_ALLOWLIST_EMAILS.length,
      providers: {
        googleOcr: {
          enabled: GOOGLE_OCR_ENABLED,
          configured: Boolean(GOOGLE_APPLICATION_CREDENTIALS)
        },
        yandexOcr: {
          enabled: YANDEX_OCR_ENABLED,
          configured: Boolean(YANDEX_API_KEY && YANDEX_FOLDER_ID),
          languageCodes: YANDEX_OCR_LANGUAGE_CODES,
          model: YANDEX_OCR_MODEL || "default"
        },
        yandexAi: {
          enabled: YANDEX_AI_ENABLED,
          configured: Boolean(YANDEX_API_KEY && YANDEX_FOLDER_ID),
          modelUriConfigured: Boolean(YANDEX_GPT_MODEL_URI)
        },
        openai: {
          enabled: OPENAI_ENABLED,
          configured: Boolean(OPENAI_API_KEY),
          model: OPENAI_MODEL
        }
      },
      pipelines: {
        guest: getProcessingPipelineForUser(null, { audience: "guest" }),
        free: getProcessingPipelineForUser(null, { audience: "free" }),
        paid: getProcessingPipelineForUser(null, { audience: "paid" })
      }
    },
    limits: {
      guestDocumentLimit: GUEST_DOCUMENT_LIMIT,
        userRecordLimit: DEFAULT_FREE_PROCESSING_LIMIT,
      guestDocumentTtlHours: GUEST_DOCUMENT_TTL_HOURS,
      uploadFileLimitMb: 10
    },
    payments: {
      yookassa: {
        enabled: YOOKASSA_ENABLED,
        configured: Boolean(YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY)
      }
    },
    analytics: {
      metrika: {
        enabled: YANDEX_METRIKA_API_ENABLED,
        configured: Boolean(YANDEX_METRIKA_COUNTER_ID && YANDEX_METRIKA_API_TOKEN),
        counterId: YANDEX_METRIKA_COUNTER_ID,
        visitsStartDate: YANDEX_METRIKA_VISITS_START_DATE
      }
    }
  };
}

async function loadMetrikaVisitsForUsers(users) {
  return getMetrikaVisitsByClientIds(users.map((user) => user.metrika_client_id));
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
  const metrikaVisits = await loadMetrikaVisitsForUsers(users);
  return res.json(users.map((user) => mapAdminUser(user, { metrikaVisits })));
});

router.get("/admin-api/access-requests", requireAdmin, async (req, res) => {
  const requests = await listAccessRequestsForAdmin();
  return res.json(requests.map(mapAdminAccessRequest));
});

router.get("/admin-api/processing-credits", requireAdmin, async (req, res) => {
  const events = await listProcessingCreditEventsForAdmin();
  return res.json(events.map(mapAdminProcessingCreditEvent));
});

router.get("/admin-api/improvement-requests", requireAdmin, async (req, res) => {
  const requests = await listImprovementRequestsForAdmin();
  return res.json(requests.map((request) => mapAdminImprovementRequest(request)));
});

router.get("/admin-api/improvement-requests/:id", requireAdmin, async (req, res) => {
  const request = await findImprovementRequestForAdmin(req.params.id);

  if (!request) {
    return res.status(404).json({ error: "IMPROVEMENT_REQUEST_NOT_FOUND" });
  }

  return res.json(mapAdminImprovementRequest(request, { includeDocument: true }));
});

router.get("/admin-api/improvement-requests/:id/file", requireAdmin, async (req, res) => {
  const request = await findImprovementRequestForAdmin(req.params.id);

  if (!request || !request.storage_path || !fs.existsSync(request.storage_path)) {
    return res.status(404).json({ error: "IMPROVEMENT_REQUEST_FILE_NOT_FOUND" });
  }

  return res.sendFile(path.resolve(request.storage_path));
});

router.patch("/admin-api/improvement-requests/:id/status", requireAdmin, async (req, res) => {
  const status = String(req.body?.status || "");

  if (status !== "in_review") {
    return res.status(400).json({ error: "INVALID_IMPROVEMENT_REQUEST_STATUS" });
  }

  const updated = await updateImprovementRequestStatusForAdmin(req.params.id, status);

  if (!updated) {
    return res.status(404).json({ error: "IMPROVEMENT_REQUEST_NOT_FOUND" });
  }

  const request = await findImprovementRequestForAdmin(req.params.id);
  return res.json(mapAdminImprovementRequest(request || updated, { includeDocument: true }));
});

router.patch("/admin-api/improvement-requests/:id/result", requireAdmin, async (req, res) => {
  const status = String(req.body?.status || "");
  const improvedText = String(req.body?.improvedText || "").trim();
  const adminComment = String(req.body?.adminComment || "").trim();

  if (!new Set(["improved", "not_improvable"]).has(status)) {
    return res.status(400).json({ error: "INVALID_IMPROVEMENT_REQUEST_STATUS" });
  }

  if (status === "improved" && !improvedText) {
    return res.status(400).json({ error: "IMPROVED_TEXT_REQUIRED" });
  }

  if (adminComment.length > 2000) {
    return res.status(400).json({ error: "ADMIN_COMMENT_TOO_LONG" });
  }

  const result = await completeImprovementRequestForAdmin({
    id: req.params.id,
    status,
    improvedText,
    adminComment
  });

  if (!result) {
    return res.status(404).json({ error: "IMPROVEMENT_REQUEST_NOT_FOUND" });
  }

  if (result.conflict) {
    return res.status(409).json({ error: "IMPROVEMENT_REQUEST_NOT_IN_REVIEW" });
  }

  const request = await findImprovementRequestForAdmin(req.params.id);
  return res.json(mapAdminImprovementRequest(request || result.request, { includeDocument: true }));
});

router.get("/admin-api/settings", requireAdmin, (req, res) => {
  return res.json(getAdminSettings());
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

  const metrikaVisits = await loadMetrikaVisitsForUsers([user]);
  return res.json(mapAdminUser(user, { metrikaVisits }));
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

router.post("/admin-api/users/:id/processing-credits", requireAdmin, async (req, res) => {
  const amount = Math.max(0, Number(req.body?.amount || 0));
  const packageTitle = String(req.body?.packageTitle || "Пакет").trim();

  if (!amount) {
    return res.status(400).json({ error: "INVALID_AMOUNT" });
  }

  const user = await findUserForAdmin(req.params.id);

  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const updatedUser = await grantManualProcessingCredit({
    userId: req.params.id,
    packageTitle,
    amount,
    note: req.body?.note || "Начислено вручную в админке",
    createdBy: ADMIN_LOGIN || "admin"
  });

  if (!updatedUser) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const adminUser = await findUserForAdmin(req.params.id);
  const events = await listProcessingCreditEventsForAdmin();
  return res.json({
    user: mapAdminUser(adminUser || updatedUser),
    credits: events.map(mapAdminProcessingCreditEvent)
  });
});

export default router;
