import { Router } from "express";
import { CLIENT_URL } from "../config/env.js";
import { getProcessingGuardError } from "../utils/photos.js";

const router = Router();

router.get("/auth/google", (req, res, next) => {
  req.app.get("passport").authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get(
  "/auth/google/callback",
  (req, res, next) => {
    req.app.get("passport").authenticate("google", { failureRedirect: "/" })(req, res, next);
  },
  (req, res) => res.redirect(CLIENT_URL)
);

router.get("/api/me", (req, res) => {
  if (!req.user) {
    return res.send(null);
  }

  return res.send({
    ...req.user,
    processingAllowed: !getProcessingGuardError(req.user)
  });
});
router.get("/logout", (req, res) => {
  req.logout(() => res.redirect(CLIENT_URL));
});

export default router;
