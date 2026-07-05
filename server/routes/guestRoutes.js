import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { GUEST_DOCUMENT_LIMIT, GUEST_DOCUMENT_TTL_HOURS } from "../config/env.js";
import { uploadsDir } from "../config/paths.js";
import {
  createGuestDocument,
  findGuestDocumentById,
  listGuestDocumentsBySessionId,
  replaceGuestDocumentUpload,
  updateGuestDocumentProcessingResult,
  updateGuestDocumentStatus
} from "../repositories/guestDocumentsRepository.js";
import {
  consumeGuestDocumentSlot,
  createGuestSession,
  findGuestSessionByToken,
  touchGuestSession
} from "../repositories/guestSessionsRepository.js";
import {
  canProcessImageWithPipeline,
  enrichWithPipeline,
  getProcessingPipelineForUser,
  processImageWithPipeline,
  recognizeWithPipeline
} from "../services/processingPipelineService.js";
import { getGuestDocumentAccess, getGuestDocumentExpiryDate, getGuestUploadGuardError, GUEST_SESSION_COOKIE_NAME, isGuestDocumentExpired, mapGuestDocumentInfo, parseCookies } from "../utils/guest.js";
import { normalizeOcrResult } from "../utils/ocr.js";
import { createRequestTimer } from "../utils/performanceLog.js";
import { getProcessingServiceGuardError } from "../utils/photos.js";

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

async function findReplaceableGuestDocument(req, guestSession) {
  const replaceDocumentId = req.body?.replaceDocumentId;

  if (!replaceDocumentId) {
    return null;
  }

  const document = await findGuestDocumentById(replaceDocumentId);

  if (
    !document ||
    document.guest_session_id !== guestSession.id ||
    isGuestDocumentExpired(document) ||
    !["no_text", "error"].includes(document.status)
  ) {
    return null;
  }

  return document;
}

async function enrichGuestDocumentWithAi({ text, timer }) {
  const pipeline = getProcessingPipelineForUser(null, { audience: "guest" });
  const serviceGuardError = getProcessingServiceGuardError(pipeline);

  if (serviceGuardError) {
    timer.log("ai_skipped", {
      error: serviceGuardError
    });

    return {
      title: "Запись",
      summary: "",
      category: "",
      section: "",
      topic: "",
      tags: [],
      cleanText: text,
      textQuality: "low_confidence",
      notes: "Текст распознан, но краткое описание временно недоступно."
    };
  }

  timer.log("ai_started", {
    pipeline: pipeline.pipeline,
    provider: pipeline.aiProvider,
    textLength: text.trim().length
  });

  const aiResult = await enrichWithPipeline(text, pipeline);

  timer.log("ai_finished", {
    pipeline: pipeline.pipeline,
    provider: pipeline.aiProvider
  });

  if (aiResult.error) {
    timer.log("ai_failed", {
      error: aiResult.error
    });

    return {
      title: "Запись",
      summary: "",
      category: "",
      section: "",
      topic: "",
      tags: [],
      cleanText: text,
      textQuality: "low_confidence",
      notes: "Текст распознан, но краткое описание временно недоступно."
    };
  }

  return aiResult;
}

function buildGuestStateResponse({ guestSession = null, guestDocuments = [] } = {}) {
  const documents = guestDocuments.map(buildGuestDocumentResponse);

  return {
    document: documents[0] || null,
    documents,
    access: getGuestDocumentAccess(guestSession)
  };
}

async function buildGuestStateForSession(guestSession) {
  if (!guestSession) {
    return buildGuestStateResponse();
  }

  const guestDocuments = await listGuestDocumentsBySessionId(guestSession.id);
  return buildGuestStateResponse({ guestSession, guestDocuments });
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

    return res.json(await buildGuestStateForSession(guestSession));
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
  const timer = createRequestTimer("guest-upload");

  upload.single("photo")(req, res, async function (err) {
    if (err) {
      timer.log("multer_error", {
        errorCode: err.code || err.message
      });

      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "FILE_TOO_LARGE" });
      if (err.message === "INVALID_FILE_TYPE") return res.status(400).json({ error: "INVALID_FILE_TYPE" });
      return res.status(500).json({ error: "UPLOAD_ERROR" });
    }

    if (!req.file) {
      timer.log("no_file");
      return res.status(400).json({ error: "NO_FILE" });
    }

    timer.log("file_received", {
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size
    });

    try {
      const guestSession = await getOrCreateGuestSession(req, res);
      timer.log("guest_session_ready", {
        documentsUsed: guestSession.documents_used,
        documentLimit: GUEST_DOCUMENT_LIMIT
      });

      const guardError = getGuestUploadGuardError(guestSession);

      if (guardError) {
        const filePath = path.join(uploadsDir, req.file.filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        timer.log("limit_rejected", {
          error: guardError
        });

        return res.status(409).json({ error: guardError });
      }

      const replacementDocument = await findReplaceableGuestDocument(req, guestSession);
      const newStoragePath = path.join(uploadsDir, req.file.filename);
      const pipeline = getProcessingPipelineForUser(null, { audience: "guest" });
      const guestDocument = replacementDocument
        ? await replaceGuestDocumentUpload(replacementDocument.id, {
          filename: req.file.filename,
          storagePath: newStoragePath,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          status: "processing",
          ocrProvider: pipeline.ocrProvider,
          expiresAt: getGuestDocumentExpiryDate()
        })
        : await createGuestDocument({
          guestSessionId: guestSession.id,
          filename: req.file.filename,
          storagePath: newStoragePath,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          status: "processing",
          ocrProvider: pipeline.ocrProvider,
          expiresAt: getGuestDocumentExpiryDate()
        });

      if (
        replacementDocument?.storage_path &&
        replacementDocument.storage_path !== newStoragePath &&
        fs.existsSync(replacementDocument.storage_path)
      ) {
        fs.unlinkSync(replacementDocument.storage_path);
      }

      timer.log("document_created", {
        documentId: guestDocument.id,
        replacedDocumentId: replacementDocument?.id || null
      });

      if (canProcessImageWithPipeline(pipeline)) {
        timer.log("image_ai_started", {
          pipeline: pipeline.pipeline,
          provider: pipeline.aiProvider
        });

        const aiResult = await processImageWithPipeline(guestDocument.storage_path, pipeline);

        timer.log("image_ai_finished", {
          pipeline: pipeline.pipeline,
          provider: pipeline.aiProvider
        });

        if (aiResult.error) {
          const updatedDocument = await updateGuestDocumentStatus(guestDocument.id, "error", aiResult.error);
          timer.log("response_error", {
            status: "error",
            error: aiResult.error
          });

          return res.status(200).json({
            ...(await buildGuestStateForSession(guestSession)),
            document: {
              ...buildGuestDocumentResponse(updatedDocument),
              error: aiResult.error
            }
          });
        }

        const text = aiResult.ocrText || aiResult.cleanText || "";

        if (text.trim().length < 10 && aiResult.textQuality === "no_meaningful_text") {
          await updateGuestDocumentProcessingResult(guestDocument.id, {
            status: "no_text",
            ocrText: text,
            errorMessage: null,
            processedAt: new Date()
          });

          timer.log("response_no_text", {
            textLength: text.trim().length
          });

          return res.status(200).json(await buildGuestStateForSession(guestSession));
        }

        const consumedSession = await consumeGuestDocumentSlot(guestSession.id, GUEST_DOCUMENT_LIMIT);

        if (!consumedSession) {
          const filePath = path.join(uploadsDir, req.file.filename);

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          await updateGuestDocumentStatus(guestDocument.id, "error", "GUEST_LIMIT_REACHED");
          timer.log("limit_rejected_after_ai");
          return res.status(409).json({ error: "GUEST_LIMIT_REACHED" });
        }

        timer.log("guest_slot_consumed", {
          documentsUsed: consumedSession.documents_used,
          documentLimit: GUEST_DOCUMENT_LIMIT
        });

        await updateGuestDocumentProcessingResult(guestDocument.id, {
          status: "processed",
          ocrText: text,
          aiProvider: pipeline.aiProvider,
          title: aiResult.title,
          summary: aiResult.summary,
          category: aiResult.category,
          section: aiResult.section,
          topic: aiResult.topic,
          tags: aiResult.tags,
          cleanText: aiResult.cleanText,
          textQuality: aiResult.textQuality,
          aiNotes: aiResult.notes,
          errorMessage: null,
          processedAt: new Date()
        });

        timer.log("response_processed", {
          textLength: text.trim().length
        });

        return res.status(200).json(await buildGuestStateForSession(consumedSession));
      }

      timer.log("ocr_started", {
        pipeline: pipeline.pipeline,
        provider: pipeline.ocrProvider,
        languageCodes: pipeline.ocrLanguageCodes,
        model: pipeline.ocrModel || null
      });

      const rawOcrResult = await recognizeWithPipeline(guestDocument.storage_path, pipeline);

      timer.log("ocr_finished", {
        pipeline: pipeline.pipeline,
        provider: pipeline.ocrProvider
      });

      const ocrResult = normalizeOcrResult(rawOcrResult);

      if (ocrResult.error) {
        const updatedDocument = await updateGuestDocumentStatus(guestDocument.id, "error", ocrResult.error);
        timer.log("response_error", {
          status: "error",
          error: ocrResult.error
        });

        return res.status(200).json({
          ...(await buildGuestStateForSession(guestSession)),
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

        timer.log("response_no_text", {
          textLength: text.trim().length
        });

        return res.status(200).json(await buildGuestStateForSession(guestSession));
      }

      const consumedSession = await consumeGuestDocumentSlot(guestSession.id, GUEST_DOCUMENT_LIMIT);

      if (!consumedSession) {
        const filePath = path.join(uploadsDir, req.file.filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        await updateGuestDocumentStatus(guestDocument.id, "error", "GUEST_LIMIT_REACHED");
        timer.log("limit_rejected_after_ocr");
        return res.status(409).json({ error: "GUEST_LIMIT_REACHED" });
      }

      timer.log("guest_slot_consumed", {
        documentsUsed: consumedSession.documents_used,
        documentLimit: GUEST_DOCUMENT_LIMIT
      });

      const aiResult = await enrichGuestDocumentWithAi({
        text,
        timer
      });

      const updatedDocument = await updateGuestDocumentProcessingResult(guestDocument.id, {
        status: "processed",
        ocrText: text,
        aiProvider: pipeline.aiProvider,
        title: aiResult.title,
        summary: aiResult.summary,
        category: aiResult.category,
        section: aiResult.section,
        topic: aiResult.topic,
        tags: aiResult.tags,
        cleanText: aiResult.cleanText,
        textQuality: aiResult.textQuality,
        aiNotes: aiResult.notes,
        errorMessage: null,
        processedAt: new Date()
      });

      timer.log("response_processed", {
        textLength: text.trim().length
      });

      return res.status(200).json(await buildGuestStateForSession(consumedSession));
    } catch (error) {
      const filePath = req.file ? path.join(uploadsDir, req.file.filename) : null;

      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      timer.log("response_failed", {
        error: error.message
      });
      console.error("Guest upload error:", error);
      return res.status(500).json({ error: "GUEST_UPLOAD_FAILED" });
    }
  });
});

export default router;
