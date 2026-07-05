import { Router } from "express";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { createAccessRequest, listAccessRequestsForUser } from "../repositories/accessRequestsRepository.js";

const router = Router();

function mapAccessRequest(request) {
  return {
    id: String(request.id),
    message: request.message || "",
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at
  };
}

router.get("/api/access-requests", requireAuthenticatedUser, async (req, res) => {
  try {
    const requests = await listAccessRequestsForUser(req.user.id);
    return res.json(requests.map(mapAccessRequest));
  } catch (error) {
    console.error("List access requests error:", error);
    return res.status(500).json({ error: "ACCESS_REQUESTS_LOAD_FAILED" });
  }
});

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

    return res.status(201).json(mapAccessRequest(accessRequest));
  } catch (error) {
    console.error("Create access request error:", error);
    return res.status(500).json({ error: "ACCESS_REQUEST_CREATE_FAILED" });
  }
});

export default router;
