import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { GUEST_DOCUMENT_LIMIT, GUEST_DOCUMENT_TTL_HOURS } from "../config/env.js";
import { guestUploadsDir } from "../config/paths.js";
import {
  createGuestDocument,
  findGuestDocumentById,
  listGuestDocumentsBySessionId,
  replaceGuestDocumentUpload,
  updateGuestDocumentCorrectionState,
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
import { buildRecognizedResult, canRetryStoredEnrichment } from "../services/partialProcessingService.js";
import { findPhotoById, updatePhotoCorrectionState } from "../repositories/photosRepository.js";
import { acquireAccountOperationLock } from "../services/accountOperationLocks.js";

import { acquireGuestStorageLock } from "../services/guestStorageLocks.js";
import { managedFile, removeManagedFile } from "../services/guestStorageFiles.js";
import { registerGuestUpload } from "../services/guestFileIntentService.js";
import { attachUploadIntent, cancelFileIntent } from "../repositories/guestFileIntentsRepository.js";

const router = Router();

function refreshGuestCookie(res, token, expiresAt = getGuestDocumentExpiryDate()) {
  res.cookie(GUEST_SESSION_COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: Math.max(new Date(expiresAt).getTime() - Date.now(), GUEST_DOCUMENT_TTL_HOURS * 3600000)
  });
}

function getUploadAttemptId(req) {
  const headerValue = String(req.get("X-Upload-Attempt-ID") || "").trim();

  if (/^[a-zA-Z0-9_-]{8,80}$/.test(headerValue)) {
    return headerValue;
  }

  return `server-${crypto.randomUUID()}`;
}

function getSafeUserAgent(req) {
  const userAgent = String(req.get("user-agent") || "").toLowerCase();

  return {
    platform: userAgent.includes("android")
      ? "android"
      : userAgent.includes("iphone") || userAgent.includes("ipad")
        ? "ios"
        : userAgent.includes("windows")
          ? "windows"
          : userAgent.includes("mac os")
            ? "macos"
            : "other",
    browser: userAgent.includes("yabrowser")
      ? "yandex"
      : userAgent.includes("edg/")
        ? "edge"
        : userAgent.includes("firefox")
          ? "firefox"
          : userAgent.includes("chrome") || userAgent.includes("crios")
            ? "chrome"
            : userAgent.includes("safari")
              ? "safari"
              : "other"
  };
}

function hasGuestSessionCookie(req) {
  return Boolean(parseCookies(req.headers.cookie || "")[GUEST_SESSION_COOKIE_NAME]);
}

const storage = multer.diskStorage({
  destination: guestUploadsDir,
  filename: (req, file, cb) => {
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.mimetype];
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}-guest.${ext}`;
    req.guestUploadPreparation = prepareGuestUpload(req, uniqueName);
    req.guestUploadPreparation.then(() => cb(null, uniqueName), cb);
  }
});

// Multer's disk writer does not close its output on a disconnected request.
// Keep our locks until that descriptor closes, including preparation failures.
storage._handleFile = (req, file, cb) => {
  let settle;
  req.guestUploadWriteFinished = new Promise((resolve) => { settle = resolve; });
  storage.getFilename(req, file, (error, filename) => {
    if (error) { settle(); cb(error); return; }
    const destination = path.join(guestUploadsDir, filename);
    const output = fs.createWriteStream(destination, { flags: "wx" });
    let failure;
    const abort = (error) => {
      failure = error instanceof Error ? error : Object.assign(new Error("UPLOAD_ABORTED"), { code: "UPLOAD_ABORTED" });
      file.stream.unpipe(output);
      output.destroy(failure);
    };
    req.once("aborted", abort);
    file.stream.once("error", abort);
    output.once("error", (error) => { failure = error; });
    output.once("close", () => {
      req.removeListener("aborted", abort);
      file.stream.removeListener("error", abort);
      settle();
      cb(failure, failure ? undefined : { destination: guestUploadsDir, filename, path: destination, size: output.bytesWritten });
    });
    if (req.aborted) abort(); else file.stream.pipe(output);
  });
};

async function prepareGuestUpload(req, filename) {
  // Multer cannot open the file until this callback returns. Register first,
  // while holding the session lock, then keep it through streaming and OCR.
  while (true) {
    const session = await getOrCreateGuestSession(req, req.res);
    const release = await acquireGuestStorageLock(session.id);
    req.guestStorageRelease = release;
    const current = await findGuestSessionByToken(session.session_token);
    if (!current || current.converted_user_id) { await release(); req.guestStorageRelease = null; continue; }
    req.guestUploadSession = current;
    const guardError = getGuestUploadGuardError(current);
    if (guardError) throw Object.assign(new Error(guardError), { code: guardError });
    if (req.aborted) throw Object.assign(new Error("UPLOAD_ABORTED"), { code: "UPLOAD_ABORTED" });
    req.guestFileIntent = await registerGuestUpload(current.id, filename);
    if (req.aborted) throw Object.assign(new Error("UPLOAD_ABORTED"), { code: "UPLOAD_ABORTED" });
    return;
  }
}

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
  if (!document || isGuestDocumentExpired(document)) return null;
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

async function enrichGuestDocumentWithAi({ text, timer, trigger = "upload" }) {
  const pipeline = getProcessingPipelineForUser(null, { audience: "guest" });
  const serviceGuardError = getProcessingServiceGuardError(pipeline);

  if (serviceGuardError) {
    timer.log("ai_skipped", {
      error: serviceGuardError
    });

    return { error: serviceGuardError, errorCode: "AI_SERVICE_UNAVAILABLE", retryable: true };
  }

  timer.log("ai_started", {
    pipeline: pipeline.pipeline,
    provider: pipeline.aiProvider,
    textLength: text.trim().length
  });

  const aiResult = await enrichWithPipeline(text, pipeline, { trigger });

  timer.log("ai_finished", {
    pipeline: pipeline.pipeline,
    provider: pipeline.aiProvider
  });

  if (aiResult.error) {
    timer.log("ai_failed", {
      error: aiResult.error
    });

    return aiResult;
  }

  return aiResult;
}

function buildGuestStateResponse({ guestSession = null, guestDocuments = [] } = {}) {
  const documents = guestDocuments.map(buildGuestDocumentResponse).filter(Boolean);

  return {
    document: documents[0] || null,
    documents,
    access: getGuestDocumentAccess(guestSession)
  };
}

const authenticatedUserId = (req) => req?.isAuthenticated?.() ? req.user?.id : null;

async function canReadGuestDocument(req, document) {
  if (document.status !== "claimed") return true;
  const userId = authenticatedUserId(req);
  if (!userId) return false;
  const photo = await findPhotoById(document.claimed_photo_id);
  return photo && String(photo.user_id) === String(userId);
}

async function buildGuestStateForSession(guestSession, req) {
  if (!guestSession) {
    return buildGuestStateResponse();
  }

  const guestDocuments = await listGuestDocumentsBySessionId(guestSession.id, authenticatedUserId(req));
  return buildGuestStateResponse({ guestSession, guestDocuments });
}

async function getOrCreateGuestSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const existingToken = cookies[GUEST_SESSION_COOKIE_NAME];

  if (existingToken) {
    const existingSession = await findGuestSessionByToken(existingToken);

    if (existingSession && !existingSession.converted_user_id) {
      refreshGuestCookie(res, existingToken);
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

  refreshGuestCookie(res, sessionToken);

  return guestSession;
}

router.get("/api/guest/document", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
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

    return res.json(await buildGuestStateForSession(guestSession, req));
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
      !await canReadGuestDocument(req, guestDocument) ||
      !fs.existsSync(guestDocument.storage_path)
    ) {
      return res.status(404).json({ error: "Guest document not found" });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(await managedFile(guestDocument.storage_path, ["legacy", "guests", "users"]));
  } catch (error) {
    console.error("Guest document file error:", error);
    return res.status(500).json({ error: "GUEST_DOCUMENT_FILE_FAILED" });
  }
});

router.patch("/api/guest/documents/:id/corrections/:correctionId", async (req, res) => {
  let releaseGuestLock, releaseAccount;
  try {
    if (typeof req.body?.applied !== "boolean") {
      return res.status(400).json({ error: "INVALID_CORRECTION_STATE" });
    }

    const cookies = parseCookies(req.headers.cookie);
    if (authenticatedUserId(req)) {
      releaseAccount = await acquireAccountOperationLock(authenticatedUserId(req));
      if (!releaseAccount) return res.status(409).json({ error: "ACCOUNT_BUSY" });
    }
    const guestSession = await findGuestSessionByToken(cookies[GUEST_SESSION_COOKIE_NAME]);
    if (guestSession) releaseGuestLock = await acquireGuestStorageLock(guestSession.id);
    const document = await findGuestDocumentById(req.params.id);

    if (!guestSession || !document
      || document.guest_session_id !== guestSession.id
      || isGuestDocumentExpired(document) || !await canReadGuestDocument(req, document)) {
      return res.status(404).json({ error: "Guest document not found" });
    }

    const updateCorrection = document.status === "claimed" ? updatePhotoCorrectionState : updateGuestDocumentCorrectionState;
    const updatedDocument = await updateCorrection(
      document.status === "claimed" ? document.claimed_photo_id : document.id,
      req.params.correctionId,
      req.body.applied
    );

    if (!updatedDocument) {
      return res.status(404).json({ error: "Correction not found" });
    }

    return res.json(await buildGuestStateForSession(guestSession, req));
  } catch (error) {
    console.error("Guest document correction update error:", error);
    return res.status(500).json({ error: "GUEST_DOCUMENT_CORRECTION_UPDATE_FAILED" });
  } finally {
    if (releaseGuestLock) await releaseGuestLock();
    if (releaseAccount) await releaseAccount();
  }
});

router.post("/api/guest/documents/:id/retry-processing", async (req, res) => {
  const timer = createRequestTimer("guest-retry", { documentId: req.params.id });

  let releaseGuestLock;
  try {
    const cookies = parseCookies(req.headers.cookie);
    const guestSession = await findGuestSessionByToken(cookies[GUEST_SESSION_COOKIE_NAME]);
    if (guestSession) releaseGuestLock = await acquireGuestStorageLock(guestSession.id);
    const guestDocument = await findGuestDocumentById(req.params.id);

    if (!guestSession || !guestDocument
      || guestDocument.guest_session_id !== guestSession.id
      || isGuestDocumentExpired(guestDocument) || !await canReadGuestDocument(req, guestDocument)) {
      return res.status(404).json({ error: "Guest document not found" });
    }

    if (!canRetryStoredEnrichment(guestDocument)) {
      return res.status(409).json({ error: "GUEST_DOCUMENT_NOT_RETRYABLE" });
    }

    if (getGuestUploadGuardError(guestSession)) {
      return res.status(409).json({ error: "GUEST_LIMIT_REACHED" });
    }

    await updateGuestDocumentStatus(guestDocument.id, "processing", null);
    const text = guestDocument.ocr_text || "";
    const aiResult = await enrichGuestDocumentWithAi({ text, timer, trigger: "retry" });

    if (aiResult.error) {
      await updateGuestDocumentProcessingResult(
        guestDocument.id,
        buildRecognizedResult(text, aiResult.error)
      );
      return res.json(await buildGuestStateForSession(guestSession, req));
    }

    const consumedSession = await consumeGuestDocumentSlot(guestSession.id, GUEST_DOCUMENT_LIMIT);
    if (!consumedSession) {
      await updateGuestDocumentProcessingResult(guestDocument.id, buildRecognizedResult(text, "GUEST_LIMIT_REACHED"));
      return res.status(409).json({ error: "GUEST_LIMIT_REACHED" });
    }

    await updateGuestDocumentProcessingResult(guestDocument.id, {
      status: "processed",
      ocrText: text,
      aiProvider: getProcessingPipelineForUser(null, { audience: "guest" }).aiProvider,
      title: aiResult.title,
      summary: aiResult.summary,
      category: aiResult.category,
      section: aiResult.section,
      topic: aiResult.topic,
      tags: aiResult.tags,
      cleanText: aiResult.cleanText,
      formattedContent: aiResult.formattedContent,
      hasTable: aiResult.hasTable,
      hasFormulas: aiResult.hasFormulas,
      hasRecognitionErrors: aiResult.hasRecognitionErrors,
      corrections: aiResult.corrections,
      textQuality: aiResult.textQuality,
      aiNotes: aiResult.notes,
      errorMessage: null,
      processedAt: new Date()
    });

    return res.json(await buildGuestStateForSession(consumedSession, req));
  } catch (error) {
    timer.log("response_failed", { error: error.message });
    console.error("Guest retry error:", error);
    return res.status(500).json({ error: "GUEST_RETRY_FAILED" });
  } finally { if (releaseGuestLock) await releaseGuestLock(); }
});

router.post("/api/guest/upload", (req, res) => {
  const uploadAttemptId = getUploadAttemptId(req);
  const timer = createRequestTimer("guest-upload", { uploadAttemptId });
  const requestStartedAt = Date.now();
  let responseFinished = false;

  res.setHeader("X-Upload-Attempt-ID", uploadAttemptId);
  timer.log("upload_request_received", {
    method: req.method,
    path: req.path,
    contentLength: Number(req.get("content-length") || 0),
    contentType: String(req.get("content-type") || "").split(";")[0].slice(0, 80),
    userAgent: getSafeUserAgent(req),
    guestSessionPresent: hasGuestSessionCookie(req)
  });

  req.once("aborted", () => {
    timer.log("upload_request_aborted", {
      durationMs: Date.now() - requestStartedAt
    });
  });

  req.once("error", (error) => {
    timer.log("upload_request_error", {
      durationMs: Date.now() - requestStartedAt,
      errorName: String(error?.name || "Error").slice(0, 80),
      errorMessage: String(error?.message || "").replace(/[\r\n\t]+/g, " ").slice(0, 160)
    });
  });

  res.once("finish", () => {
    responseFinished = true;
    timer.log("upload_response_finished", {
      status: res.statusCode,
      durationMs: Date.now() - requestStartedAt
    });
  });

  res.once("close", () => {
    if (!responseFinished) {
      timer.log("upload_response_closed", {
        status: res.statusCode,
        durationMs: Date.now() - requestStartedAt,
        responseFinished: false
      });
    }
  });

  timer.log("multipart_read_started");

  upload.single("photo")(req, res, async function (err) {
    if (req.guestUploadPreparation) await req.guestUploadPreparation.catch(() => {});
    let documentPersisted = false;
    try {
    if (err) {
      timer.log("multer_error", {
        errorCode: String(err.code || "UPLOAD_ERROR").slice(0, 80),
        errorType: err.code === "LIMIT_FILE_SIZE"
          ? "LIMIT_FILE_SIZE"
          : err.code === "INVALID_FILE_TYPE" || err.message === "INVALID_FILE_TYPE"
            ? "INVALID_FILE_TYPE"
            : "OTHER"
      });

      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "FILE_TOO_LARGE" });
      if (err.code === "GUEST_LIMIT_REACHED") return res.status(409).json({ error: err.code });
      if (err.message === "INVALID_FILE_TYPE") return res.status(400).json({ error: "INVALID_FILE_TYPE" });
      return res.status(500).json({ error: "UPLOAD_ERROR" });
    }

    if (!req.file) {
      timer.log("no_file");
      return res.status(400).json({ error: "NO_FILE" });
    }

    timer.log("file_received", {
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size
    });

      const guestSession = req.guestUploadSession;
      timer.log("guest_session_ready", {
        documentsUsed: guestSession.documents_used,
        documentLimit: GUEST_DOCUMENT_LIMIT
      });

      const guardError = getGuestUploadGuardError(guestSession);

      if (guardError) {
        const filePath = path.join(guestUploadsDir, req.file.filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        timer.log("limit_rejected", {
          error: guardError
        });

        return res.status(409).json({ error: guardError });
      }

      const replacementDocument = await findReplaceableGuestDocument(req, guestSession);
      const newStoragePath = path.join(guestUploadsDir, req.file.filename);
      const pipeline = getProcessingPipelineForUser(null, { audience: "guest" });
      const guestDocument = replacementDocument
        ? await replaceGuestDocumentUpload(replacementDocument.id, {
          filename: req.file.filename,
          storagePath: newStoragePath,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          status: "processing",
          ocrProvider: pipeline.ocrProvider
        })
        : await createGuestDocument({
          guestSessionId: guestSession.id,
          filename: req.file.filename,
          storagePath: newStoragePath,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          status: "processing",
          ocrProvider: pipeline.ocrProvider,
          createdAt: req.guestFileIntent.created_at,
          expiresAt: req.guestFileIntent.expires_at
        });

      documentPersisted = true;
      await attachUploadIntent(req.guestFileIntent.id, guestDocument);
      refreshGuestCookie(res, guestSession.session_token, guestDocument.expires_at);

      if (
        replacementDocument?.storage_path &&
        replacementDocument.storage_path !== newStoragePath &&
        path.dirname(replacementDocument.storage_path) === guestUploadsDir &&
        fs.existsSync(replacementDocument.storage_path)
      ) {
        await removeManagedFile(replacementDocument.storage_path);
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
            ...(await buildGuestStateForSession(guestSession, req)),
            document: isGuestDocumentExpired(updatedDocument) ? null : {
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

          return res.status(200).json(await buildGuestStateForSession(guestSession, req));
        }

        const consumedSession = await consumeGuestDocumentSlot(guestSession.id, GUEST_DOCUMENT_LIMIT);

        if (!consumedSession) {
          const filePath = path.join(guestUploadsDir, req.file.filename);

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
          formattedContent: aiResult.formattedContent,
          hasTable: aiResult.hasTable,
          hasFormulas: aiResult.hasFormulas,
          hasRecognitionErrors: aiResult.hasRecognitionErrors,
          corrections: aiResult.corrections,
          textQuality: aiResult.textQuality,
          aiNotes: aiResult.notes,
          errorMessage: null,
          processedAt: new Date()
        });

        timer.log("response_processed", {
          textLength: text.trim().length
        });

        return res.status(200).json(await buildGuestStateForSession(consumedSession, req));
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
          ...(await buildGuestStateForSession(guestSession, req)),
          document: isGuestDocumentExpired(updatedDocument) ? null : {
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

        return res.status(200).json(await buildGuestStateForSession(guestSession, req));
      }

      const aiResult = await enrichGuestDocumentWithAi({
        text,
        timer
      });

      if (aiResult.error) {
        await updateGuestDocumentProcessingResult(
          guestDocument.id,
          buildRecognizedResult(text, aiResult.error)
        );
        timer.log("response_recognized", {
          error: aiResult.error,
          errorCode: aiResult.errorCode || null,
          retryable: Boolean(aiResult.retryable),
          attempts: aiResult.attempts || 1
        });
        return res.status(200).json(await buildGuestStateForSession(guestSession, req));
      }

      const consumedSession = await consumeGuestDocumentSlot(guestSession.id, GUEST_DOCUMENT_LIMIT);

      if (!consumedSession) {
        await updateGuestDocumentProcessingResult(guestDocument.id, buildRecognizedResult(text, "GUEST_LIMIT_REACHED"));
        timer.log("limit_rejected_after_ai");
        return res.status(409).json({ error: "GUEST_LIMIT_REACHED" });
      }

      timer.log("guest_slot_consumed", {
        documentsUsed: consumedSession.documents_used,
        documentLimit: GUEST_DOCUMENT_LIMIT
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
        formattedContent: aiResult.formattedContent,
        hasTable: aiResult.hasTable,
        hasFormulas: aiResult.hasFormulas,
        hasRecognitionErrors: aiResult.hasRecognitionErrors,
        corrections: aiResult.corrections,
        textQuality: aiResult.textQuality,
        aiNotes: aiResult.notes,
        errorMessage: null,
        processedAt: new Date()
      });

      timer.log("response_processed", {
        textLength: text.trim().length
      });

      return res.status(200).json(await buildGuestStateForSession(consumedSession, req));
    } catch (error) {
      const filePath = req.file ? path.join(guestUploadsDir, req.file.filename) : null;

      if (!documentPersisted && filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      timer.log("response_failed", {
        error: error.message
      });
      console.error("Guest upload error:", error);
      return res.status(500).json({ error: "GUEST_UPLOAD_FAILED" });
    } finally {
      try {
        if (req.guestFileIntent && !documentPersisted) await cancelFileIntent(req.guestFileIntent.id);
      } catch (error) { console.error("Guest upload intent cleanup:", { code: error.code || "INTENT_ERROR" }); }
      finally {
        if (req.guestUploadWriteFinished) await req.guestUploadWriteFinished;
        if (req.guestFileIntent) await req.guestFileIntent.release();
        if (req.guestStorageRelease) await req.guestStorageRelease();
      }
    }
  });
});

export default router;
