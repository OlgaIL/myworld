import { Router } from "express";
import { CLIENT_URL } from "../config/env.js";
import { getConfiguredAuthProviders, isAuthProviderConfigured } from "../auth/providers.js";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { countPhotosByUser } from "../repositories/photosRepository.js";
import { mapUserForSession, saveUserAcquisitionContext, updateUserLegalAgreement } from "../repositories/usersRepository.js";
import { claimGuestDocumentForUser } from "../services/guestClaimService.js";
import { getProcessingPipelineForUser } from "../services/processingPipelineService.js";
import {
  EmailAuthError,
  hashRequestIp,
  normalizeEmail,
  requestEmailLoginCode,
  verifyEmailLoginCode
} from "../services/emailAuthService.js";
import { getProcessingGuardError, getUserProcessingAccess, getUserProductAccess } from "../utils/photos.js";

const router = Router();
const LEGAL_AGREEMENT_VERSION = "2026-07-15";
const ACQUISITION_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "landing_path", "captured_at"]);

function sanitizeAcquisitionContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => ACQUISITION_KEYS.has(key) && typeof item === "string" && item.trim())
      .map(([key, item]) => [key, item.trim().slice(0, key === "landing_path" ? 1500 : 500)])
  );
}

function redirectWithAuthError(res, providerId, errorCode = "oauth_failed") {
  const target = new URL(CLIENT_URL || "/", "http://localhost");
  target.searchParams.set("auth_error", errorCode);
  target.searchParams.set("auth_provider", providerId);
  return res.redirect(CLIENT_URL ? target.toString() : `${target.pathname}${target.search}`);
}

function requireConfiguredProvider(providerId) {
  return (req, res, next) => {
    if (!isAuthProviderConfigured(providerId)) {
      return redirectWithAuthError(res, providerId, "provider_not_configured");
    }

    return next();
  };
}

function authenticateProviderCallback(providerId, getOptions = () => ({})) {
  return (req, res, next) => {
    req.app.get("passport").authenticate(providerId, getOptions(req), (error, user) => {
      if (error || !user) {
        return redirectWithAuthError(res, providerId);
      }

      return req.logIn(user, (loginError) => {
        if (loginError) {
          return redirectWithAuthError(res, providerId);
        }

        return next();
      });
    })(req, res, next);
  };
}

async function completeLogin(req) {
  try {
    await claimGuestDocumentForUser(req);
  } catch (error) {
    console.error("Guest claim after login failed:", error.message);
  }

  try {
    const acquisitionContext = sanitizeAcquisitionContext(req.session?.acquisitionContext);
    await saveUserAcquisitionContext(req.user?.id, acquisitionContext);
    delete req.session.acquisitionContext;
  } catch (error) {
    console.error("Acquisition context after login failed:", error.message);
  }
}

async function finishLogin(req, res) {
  await completeLogin(req);

  res.redirect(CLIENT_URL || "/");
}

function getRequestIp(req) {
  const remoteAddress = req.socket?.remoteAddress || "";
  const isLocalProxy = remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";
  const forwardedAddress = isLocalProxy ? req.get("x-forwarded-for")?.split(",")[0]?.trim() : "";
  return forwardedAddress || remoteAddress || "unknown";
}

function sendEmailAuthError(res, error) {
  if (error instanceof EmailAuthError) {
    return res.status(error.status).json({
      error: error.code,
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {})
    });
  }

  console.error("Email auth failed:", error.message);
  return res.status(500).json({ error: "EMAIL_AUTH_FAILED" });
}

function redirectPartnerSetupRequired(providerId) {
  return (req, res) => redirectWithAuthError(res, providerId, "partner_setup_required");
}

router.get("/api/auth-providers", (req, res) => {
  res.json(getConfiguredAuthProviders());
});

router.post("/api/acquisition", (req, res) => {
  req.session.acquisitionContext = sanitizeAcquisitionContext(req.body?.context);
  return res.status(204).send();
});

router.post("/api/auth/email/request", async (req, res) => {
  if (!isAuthProviderConfigured("email")) {
    return res.status(503).json({ error: "EMAIL_AUTH_NOT_CONFIGURED" });
  }

  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: "INVALID_EMAIL" });
  }

  try {
    req.session.acquisitionContext = sanitizeAcquisitionContext(req.body?.acquisitionContext);
    const result = await requestEmailLoginCode({
      email,
      ipHash: hashRequestIp(getRequestIp(req))
    });

    return res.json({
      ok: true,
      retryAfterSeconds: result.retryAfterSeconds
    });
  } catch (error) {
    return sendEmailAuthError(res, error);
  }
});

router.post("/api/auth/email/verify", async (req, res) => {
  if (!isAuthProviderConfigured("email")) {
    return res.status(503).json({ error: "EMAIL_AUTH_NOT_CONFIGURED" });
  }

  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").replace(/\D/g, "");
  const legalVersion = req.body?.legalVersion;

  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "EMAIL_AUTH_CODE_INVALID" });
  }

  if (req.body?.legalAccepted !== true || legalVersion !== LEGAL_AGREEMENT_VERSION) {
    return res.status(400).json({ error: "LEGAL_AGREEMENT_REQUIRED" });
  }

  try {
    const user = await verifyEmailLoginCode({ email, code, legalVersion });
    const sessionUser = mapUserForSession(user);

    await new Promise((resolve, reject) => {
      req.logIn(sessionUser, (error) => (error ? reject(error) : resolve()));
    });

    await completeLogin(req);
    return res.json({ ok: true });
  } catch (error) {
    return sendEmailAuthError(res, error);
  }
});

router.get("/auth/google", requireConfiguredProvider("google"), (req, res, next) => {
  req.app.get("passport").authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get("/auth/yandex", requireConfiguredProvider("yandex"), (req, res, next) => {
  req.app.get("passport").authenticate("yandex")(req, res, next);
});

router.get("/auth/vk", requireConfiguredProvider("vk"), (req, res, next) => {
  req.app.get("passport").authenticate("vk")(req, res, next);
});

router.get("/auth/sber", requireConfiguredProvider("sber"), redirectPartnerSetupRequired("sber"));
router.get("/auth/mts", requireConfiguredProvider("mts"), redirectPartnerSetupRequired("mts"));

router.get(
  "/auth/google/callback",
  requireConfiguredProvider("google"),
  authenticateProviderCallback("google"),
  finishLogin
);

router.get(
  "/auth/yandex/callback",
  requireConfiguredProvider("yandex"),
  authenticateProviderCallback("yandex"),
  finishLogin
);

router.get(
  "/auth/vk/callback",
  requireConfiguredProvider("vk"),
  authenticateProviderCallback("vk", (req) => ({
    deviceId: req.query.device_id,
    callbackState: req.query.state
  })),
  finishLogin
);

router.get("/auth/sber/callback", requireConfiguredProvider("sber"), redirectPartnerSetupRequired("sber"));
router.get("/auth/mts/callback", requireConfiguredProvider("mts"), redirectPartnerSetupRequired("mts"));

router.get("/api/me", async (req, res) => {
  if (!req.user) {
    return res.send(null);
  }

  const processingAccess = getUserProcessingAccess(req.user);
  const recordsStored = await countPhotosByUser(req.user.id);
  const recordsUsed = Number(req.user.recordsProcessedTotal || 0);
  const recordAccess = getUserProductAccess(req.user, recordsUsed);
  const pipeline = getProcessingPipelineForUser(req.user);

  return res.send({
    ...req.user,
    recordsStored,
    processingAllowed: !getProcessingGuardError(req.user, pipeline),
    processingMode: pipeline.pipeline,
    processingUnlimited: processingAccess.processingUnlimited,
    processingQuota: processingAccess.processingQuota,
    processingUsed: processingAccess.processingUsed,
    processingRemaining: processingAccess.processingRemaining,
    ...recordAccess
  });
});

router.post("/api/legal-agreement", requireAuthenticatedUser, async (req, res) => {
  const version = req.body?.version || LEGAL_AGREEMENT_VERSION;
  const updatedUser = await updateUserLegalAgreement(req.user.id, version);

  if (!updatedUser) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  req.user = mapUserForSession(updatedUser);

  return res.json({
    legalAcceptedAt: req.user.legalAcceptedAt,
    legalVersion: req.user.legalVersion
  });
});
router.get("/logout", (req, res) => {
  req.logout(() => res.redirect(CLIENT_URL));
});

export default router;
