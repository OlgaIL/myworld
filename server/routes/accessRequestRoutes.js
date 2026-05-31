import { Router } from "express";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { createAccessRequest } from "../repositories/accessRequestsRepository.js";

const router = Router();

router.post("/api/access-requests", requireAuthenticatedUser, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim().slice(0, 1000);
    const email = req.user.email || "";

    if (!email) {
      return res.status(400).json({ error: "USER_EMAIL_REQUIRED" });
    }

    const accessRequest = await createAccessRequest({
      userId: req.user.id,
      email,
      message
    });

    return res.status(201).json({
      id: String(accessRequest.id),
      status: accessRequest.status,
      createdAt: accessRequest.created_at
    });
  } catch (error) {
    console.error("Create access request error:", error);
    return res.status(500).json({ error: "ACCESS_REQUEST_CREATE_FAILED" });
  }
});

export default router;
