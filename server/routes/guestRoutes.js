import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { OCR_PROVIDER, GUEST_DOCUMENT_LIMIT, GUEST_DOCUMENT_TTL_HOURS } from "../config/env.js";
import { YANDEX_API_KEY, YANDEX_FOLDER_ID } from "../config/private-env.js";
import { uploadsDir } from "../config/paths.js";
import {
  createGuestDocument,
  findGuestDocumentById,
  findLatestGuestDocumentBySessionId,
  updateGuestDocumentProcessingResult,
  updateGuestDocumentStatus
} from "../repositories/guestDocumentsRepository.js";
import {
  consumeGuestDocumentSlot,
  createGuestSession,
  findGuestSessionByToken,
  touchGuestSession
} from "../repositories/guestSessionsRepository.js";
import ocrService from "../services/ocrService.js";
import { getGuestDocumentAccess, getGuestDocumentExpiryDate, getGuestUploadGuardError, GUEST_SESSION_COOKIE_NAME, isGuestDocumentExpired, mapGuestDocumentInfo, parseCookies } from "../utils/guest.js";
import { normalizeOcrResult } from "../utils/ocr.js";

const router = Router();

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    const uniqueName = `${Date.now()}-guest.${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error("INVALID_FILE_TYPE");
      err.code = "INVALID_FILE_TYPE";
      cb(err);
    }
  }
});

function getRequestIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || null;
}

function hashValue(value) {
  if (!value) {
    return null;
  }

  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildGuestDocumentResponse(document) {
  return {
    ...mapGuestDocumentInfo(document),
    previewUrl: `/api/guest/documents/${document.id}/file`
  };
}

function buildGuestStateResponse({ guestSession = null, guestDocument = null } = {}) {
  return {
    document: guestDocument ? buildGuestDocumentResponse(guestDocument) : null,
    access: getGuestDocumentAccess(guestSession)
  };
}

async function getOrCreateGuestSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const existingToken = cookies[GUEST_SESSION_COOKIE_NAME];

  if (existingToken) {
    const existingSession = await findGuestSessionByToken(existingToken);

    if (existingSession) {
      const touchedSession = await touchGuestSession(existingSession.id);
      return touchedSession || existingSession;
    }
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const guestSession = await createGuestSession({
    sessionToken,
    ipHash: hashValue(getRequestIp(req)),
    userAgentHash: hashValue(req.get("user-agent"))
  });

  res.cookie(GUEST_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: GUEST_DOCUMENT_TTL_HOURS * 60 * 60 * 1000
  });

  return guestSession;
}

router.get("/api/guest/document", async (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies[GUEST_SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return res.json(buildGuestStateResponse());
    }

    const guestSession = await findGuestSessionByToken(sessionToken);

    if (!guestSession) {
      return res.json(buildGuestStateResponse());
    }

    await touchGuestSession(guestSession.id);

    const guestDocument = await findLatestGuestDocumentBySessionId(guestSession.id);

    if (!guestDocument || isGuestDocumentExpired(guestDocument)) {
      return res.json(buildGuestStateResponse({ guestSession }));
    }

    if (guestDocument.status === "claimed" && !guestDocument.claimed_photo_exists) {
      return res.json(buildGuestStateResponse({ guestSession }));
    }

    return res.json(buildGuestStateResponse({ guestSession, guestDocument }));
  } catch (error) {
    console.error("Guest document fetch error:", error);
    return res.status(500).json({ error: "GUEST_DOCUMENT_FETCH_FAILED" });
  }
});

router.get("/api/guest/documents/:id/file", async (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies[GUEST_SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return res.status(404).json({ error: "Guest document not found" });
    }

    const guestSession = await findGuestSessionByToken(sessionToken);

    if (!guestSession) {
      return res.status(404).json({ error: "Guest document not found" });
    }

    const guestDocument = await findGuestDocumentById(req.params.id);

    if (
      !guestDocument ||
      guestDocument.guest_session_id !== guestSession.id ||
      isGuestDocumentExpired(guestDocument) ||
      !fs.existsSync(guestDocument.storage_path)
    ) {
      return res.status(404).json({ error: "Guest document not found" });
    }

    return res.sendFile(guestDocument.storage_path);
  } catch (error) {
    console.error("Guest document file error:", error);
    return res.status(500).json({ error: "GUEST_DOCUMENT_FILE_FAILED" });
  }
});

router.post("/api/guest/upload", (req, res) => {
  upload.single("photo")(req, res, async function (err) {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "FILE_TOO_LARGE" });
      if (err.message === "INVALID_FILE_TYPE") return res.status(400).json({ error: "INVALID_FILE_TYPE" });
      return res.status(500).json({ error: "UPLOAD_ERROR" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "NO_FILE" });
    }

    try {
      const guestSession = await getOrCreateGuestSession(req, res);
      const guardError = getGuestUploadGuardError(guestSession);

      if (guardError) {
        const filePath = path.join(uploadsDir, req.file.filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        return res.status(409).json({ error: guardError });
      }

      const guestDocument = await createGuestDocument({
        guestSessionId: guestSession.id,
        filename: req.file.filename,
        storagePath: path.join(uploadsDir, req.file.filename),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        status: "processing",
        ocrProvider: OCR_PROVIDER,
        expiresAt: getGuestDocumentExpiryDate()
      });

      const rawOcrResult = await ocrService.recognize(guestDocument.storage_path, {
        provider: OCR_PROVIDER,
        apiKey: YANDEX_API_KEY,
        folderId: YANDEX_FOLDER_ID
      });

      const ocrResult = normalizeOcrResult(rawOcrResult);

      if (ocrResult.error) {
        const updatedDocument = await updateGuestDocumentStatus(guestDocument.id, "error", ocrResult.error);

        return res.status(200).json({
          ...buildGuestStateResponse({ guestSession, guestDocument: updatedDocument }),
          document: {
            ...buildGuestDocumentResponse(updatedDocument),
            error: ocrResult.error
          }
        });
      }

      const text = ocrResult.text || "";

      if (text.trim().length < 10) {
        const updatedDocument = await updateGuestDocumentProcessingResult(guestDocument.id, {
          status: "no_text",
          ocrText: text,
          errorMessage: null,
          processedAt: new Date()
        });

        return res.status(200).json(buildGuestStateResponse({ guestSession, guestDocument: updatedDocument }));
      }

      const consumedSession = await consumeGuestDocumentSlot(guestSession.id, GUEST_DOCUMENT_LIMIT);

      if (!consumedSession) {
        const filePath = path.join(uploadsDir, req.file.filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        await updateGuestDocumentStatus(guestDocument.id, "error", "GUEST_LIMIT_REACHED");
        return res.status(409).json({ error: "GUEST_LIMIT_REACHED" });
      }

      const updatedDocument = await updateGuestDocumentProcessingResult(guestDocument.id, {
        status: "processed",
        ocrText: text,
        errorMessage: null,
        processedAt: new Date()
      });

      return res.status(200).json(buildGuestStateResponse({ guestSession: consumedSession, guestDocument: updatedDocument }));
    } catch (error) {
      const filePath = req.file ? path.join(uploadsDir, req.file.filename) : null;

      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      console.error("Guest upload error:", error);
      return res.status(500).json({ error: "GUEST_UPLOAD_FAILED" });
    }
  });
});

export default router;
