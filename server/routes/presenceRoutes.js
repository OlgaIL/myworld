import { Router } from "express";
import { parseCookies } from "../utils/guest.js";
import { PRESENCE_COOKIE_NAME, recordPresence } from "../services/presenceService.js";

const router = Router();

router.post("/api/presence", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const presence = recordPresence(cookies[PRESENCE_COOKIE_NAME], req.user?.id);
  if (cookies[PRESENCE_COOKIE_NAME] !== presence.id) {
    res.cookie(PRESENCE_COOKIE_NAME, presence.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 2 * 60 * 60 * 1000
    });
  }
  res.status(204).end();
});

export default router;
