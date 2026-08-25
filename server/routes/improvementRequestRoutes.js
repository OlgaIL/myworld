import { Router } from "express";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { findPhotoByFilenameAndUser } from "../repositories/photosRepository.js";
import {
  createImprovementRequest,
  listImprovementRequestsForPhoto,
  listImprovementRequestsForUser,
  markCompletedImprovementRequestsViewedForPhoto
} from "../repositories/improvementRequestsRepository.js";
import {
  canRequestPhotoImprovement,
  MANUAL_REVIEW_CONSENT_VERSION,
  mapImprovementRequest,
  validateImprovementRequestInput
} from "../services/improvementRequestService.js";
import { sendImprovementRequestNotification } from "../services/emailDeliveryService.js";

const router = Router();

router.get("/api/improvement-requests", requireAuthenticatedUser, async (req, res) => {
  try {
    const requests = await listImprovementRequestsForUser(req.user.id);
    return res.json(requests.map((request) => mapImprovementRequest(request)));
  } catch (error) {
    console.error("List improvement requests error:", error);
    return res.status(500).json({ error: "IMPROVEMENT_REQUESTS_LOAD_FAILED" });
  }
});

router.get("/api/photos/:id/improvement-requests", requireAuthenticatedUser, async (req, res) => {
  try {
    const photo = await findPhotoByFilenameAndUser(req.params.id, req.user.id);
    if (!photo) {
      return res.status(404).json({ error: "PHOTO_NOT_FOUND" });
    }

    await markCompletedImprovementRequestsViewedForPhoto({
      userId: req.user.id,
      photoId: photo.id
    });

    const requests = await listImprovementRequestsForPhoto({
      userId: req.user.id,
      photoId: photo.id
    });
    return res.json(requests.map((request) => mapImprovementRequest(request, photo.filename)));
  } catch (error) {
    console.error("List photo improvement requests error:", error);
    return res.status(500).json({ error: "IMPROVEMENT_REQUESTS_LOAD_FAILED" });
  }
});

router.post("/api/photos/:id/improvement-requests", requireAuthenticatedUser, async (req, res) => {
  try {
    const photo = await findPhotoByFilenameAndUser(req.params.id, req.user.id);
    if (!photo) {
      return res.status(404).json({ error: "PHOTO_NOT_FOUND" });
    }
    if (!canRequestPhotoImprovement(photo)) {
      return res.status(409).json({ error: "PHOTO_IMPROVEMENT_NOT_AVAILABLE" });
    }

    const input = validateImprovementRequestInput(req.body);
    if (input.error) {
      return res.status(400).json({ error: input.error });
    }

    const result = await createImprovementRequest({
      userId: req.user.id,
      photoId: photo.id,
      comment: input.comment,
      consentVersion: MANUAL_REVIEW_CONSENT_VERSION
    });
    if (!result.request) {
      throw new Error("Active improvement request was not found after conflict");
    }

    if (result.created) {
      const notifyAdmin = req.app.locals.sendImprovementRequestNotification
        || sendImprovementRequestNotification;
      Promise.resolve(notifyAdmin({
        requestId: result.request.id,
        documentTitle: photo.title || "Запись"
      })).catch((notificationError) => {
        console.error("Improvement request notification error:", notificationError);
      });
    }

    return res
      .status(result.created ? 201 : 200)
      .json(mapImprovementRequest(result.request, photo.filename));
  } catch (error) {
    console.error("Create improvement request error:", error);
    return res.status(500).json({ error: "IMPROVEMENT_REQUEST_CREATE_FAILED" });
  }
});

export default router;
