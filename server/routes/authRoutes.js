import { Router } from "express";
import { CLIENT_URL, isAuthProviderEnabled } from "../config/env.js";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET } from "../config/private-env.js";
import { countPhotosByUser } from "../repositories/photosRepository.js";
import { claimGuestDocumentForUser } from "../services/guestClaimService.js";
import { getProcessingPipelineForUser } from "../services/processingPipelineService.js";
import { getProcessingGuardError, getUserProcessingAccess, getUserProductAccess } from "../utils/photos.js";

const router = Router();

function getConfiguredAuthProviders() {
  return [
    {
      id: "google",
      label: "Google",
      enabled: isAuthProviderEnabled("google") && Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
    },
    {
      id: "yandex",
      label: "Яндекс",
      enabled: isAuthProviderEnabled("yandex") && Boolean(YANDEX_CLIENT_ID && YANDEX_CLIENT_SECRET)
    }
  ].filter((provider) => provider.enabled);
}

router.get("/api/auth-providers", (req, res) => {
  res.json(getConfiguredAuthProviders().map(({ id, label }) => ({ id, label })));
});

router.get("/auth/google", (req, res, next) => {
  if (!isAuthProviderEnabled("google") || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(404).send("Google login is not available");
  }

  req.app.get("passport").authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get("/auth/yandex", (req, res, next) => {
  if (!isAuthProviderEnabled("yandex") || !YANDEX_CLIENT_ID || !YANDEX_CLIENT_SECRET) {
    return res.status(503).send("Yandex login is not configured");
  }

  req.app.get("passport").authenticate("yandex")(req, res, next);
});

router.get(
  "/auth/google/callback",
  (req, res, next) => {
    if (!isAuthProviderEnabled("google") || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect(CLIENT_URL);
    }

    req.app.get("passport").authenticate("google", { failureRedirect: "/" })(req, res, next);
  },
  async (req, res) => {
    try {
      await claimGuestDocumentForUser(req);
    } catch (error) {
      console.error("Guest claim after login failed:", error);
    }

    res.redirect(CLIENT_URL);
  }
);

router.get(
  "/auth/yandex/callback",
  (req, res, next) => {
    if (!isAuthProviderEnabled("yandex") || !YANDEX_CLIENT_ID || !YANDEX_CLIENT_SECRET) {
      return res.redirect(CLIENT_URL);
    }

    req.app.get("passport").authenticate("yandex", { failureRedirect: "/" })(req, res, next);
  },
  async (req, res) => {
    try {
      await claimGuestDocumentForUser(req);
    } catch (error) {
      console.error("Guest claim after Yandex login failed:", error);
    }

    res.redirect(CLIENT_URL);
  }
);

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
router.get("/logout", (req, res) => {
  req.logout(() => res.redirect(CLIENT_URL));
});

export default router;
