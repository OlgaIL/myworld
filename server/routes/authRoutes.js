import { Router } from "express";
import { CLIENT_URL } from "../config/env.js";
import { YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET } from "../config/private-env.js";
import { countPhotosByUser } from "../repositories/photosRepository.js";
import { claimGuestDocumentForUser } from "../services/guestClaimService.js";
import { getProcessingGuardError, getUserProcessingAccess, getUserProductAccess } from "../utils/photos.js";

const router = Router();

router.get("/auth/google", (req, res, next) => {
  req.app.get("passport").authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get("/auth/yandex", (req, res, next) => {
  if (!YANDEX_CLIENT_ID || !YANDEX_CLIENT_SECRET) {
    return res.status(503).send("Yandex login is not configured");
  }

  req.app.get("passport").authenticate("yandex")(req, res, next);
});

router.get(
  "/auth/google/callback",
  (req, res, next) => {
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
  const recordsUsed = await countPhotosByUser(req.user.id);
  const recordAccess = getUserProductAccess(req.user, recordsUsed);

  return res.send({
    ...req.user,
    processingAllowed: !getProcessingGuardError(req.user),
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
