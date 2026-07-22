import { Router } from "express";
import { CLIENT_URL } from "../config/env.js";
import { getConfiguredAuthProviders, isAuthProviderConfigured } from "../auth/providers.js";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { countPhotosByUser } from "../repositories/photosRepository.js";
import { mapUserForSession, updateUserLegalAgreement } from "../repositories/usersRepository.js";
import { claimGuestDocumentForUser } from "../services/guestClaimService.js";
import { getProcessingPipelineForUser } from "../services/processingPipelineService.js";
import { getProcessingGuardError, getUserProcessingAccess, getUserProductAccess } from "../utils/photos.js";

const router = Router();
const LEGAL_AGREEMENT_VERSION = "2026-07-15";

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

async function finishLogin(req, res) {
  try {
    await claimGuestDocumentForUser(req);
  } catch (error) {
    console.error("Guest claim after login failed:", error.message);
  }

  res.redirect(CLIENT_URL || "/");
}

function redirectPartnerSetupRequired(providerId) {
  return (req, res) => redirectWithAuthError(res, providerId, "partner_setup_required");
}

router.get("/api/auth-providers", (req, res) => {
  res.json(getConfiguredAuthProviders());
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
