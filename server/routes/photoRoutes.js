import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { AI_PROVIDER, OCR_PROVIDER, OPENAI_MODEL } from "../config/env.js";
import { OPENAI_API_KEY, YANDEX_API_KEY, YANDEX_FOLDER_ID } from "../config/private-env.js";
import { uploadsDir } from "../config/paths.js";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import {
  createPhoto,
  countPhotosByUser,
  deletePhoto,
  findPhotoByFilenameAndUser,
  listPhotosByUser,
  updatePhotoProcessingResult,
  updatePhotoStatus
} from "../repositories/photosRepository.js";
import * as aiService from "../services/aiService.js";
import ocrService from "../services/ocrService.js";
import { normalizeOcrResult } from "../utils/ocr.js";
import { createRequestTimer } from "../utils/performanceLog.js";
import { getProcessingGuardError, getUserProductAccess, mapPhotoInfo } from "../utils/photos.js";

const router = Router();

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop();
    const uniqueName = `${Date.now()}.${ext}`;
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

async function requireRecordUploadAccess(req, res, next) {
  try {
    const recordsUsed = await countPhotosByUser(req.user.id);
    const access = getUserProductAccess(req.user, recordsUsed);

    if (!access.recordUploadAllowed) {
      return res.status(409).json({
        error: "USER_RECORD_LIMIT_REACHED",
        access
      });
    }

    req.recordAccess = access;
    return next();
  } catch (error) {
    console.error("Record upload access check error:", error);
    return res.status(500).json({ error: "RECORD_ACCESS_CHECK_FAILED" });
  }
}

router.post("/api/upload", requireAuthenticatedUser, requireRecordUploadAccess, (req, res) => {
  const timer = createRequestTimer("photo-upload");

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
      await createPhoto({
        userId: req.user.id,
        filename: req.file.filename,
        storagePath: path.join(uploadsDir, req.file.filename),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        status: "uploaded",
        ocrProvider: OCR_PROVIDER,
        aiProvider: AI_PROVIDER
      });

      timer.log("photo_created");
      res.json({ id: req.file.filename, filename: req.file.filename });
    } catch (error) {
      const filePath = path.join(uploadsDir, req.file.filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      timer.log("response_failed", {
        error: error.message
      });
      console.error("DB create photo error:", error);
      res.status(500).json({ error: "PHOTO_CREATE_FAILED" });
    }
  });
});

router.get("/api/photos", requireAuthenticatedUser, async (req, res) => {
  try {
    const photos = await listPhotosByUser(req.user.id);
    res.json(photos.map((photo) => photo.filename));
  } catch (error) {
    console.error("List photos error:", error);
    res.status(500).json({ error: "PHOTOS_LIST_FAILED" });
  }
});

router.get("/api/photos/:name", requireAuthenticatedUser, async (req, res) => {
  try {
    const photo = await findPhotoByFilenameAndUser(req.params.name, req.user.id);

    if (!photo || !fs.existsSync(photo.storage_path)) {
      return res.status(404).json({ error: "Photo not found" });
    }

    res.sendFile(photo.storage_path);
  } catch (error) {
    console.error("Get photo file error:", error);
    res.status(500).json({ error: "PHOTO_FILE_FAILED" });
  }
});

router.delete("/api/photos/:name", requireAuthenticatedUser, async (req, res) => {
  try {
    const photo = await findPhotoByFilenameAndUser(req.params.name, req.user.id);

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

    if (fs.existsSync(photo.storage_path)) {
      fs.unlinkSync(photo.storage_path);
    }

    await deletePhoto(photo.id);
    res.sendStatus(200);
  } catch (error) {
    console.error("Delete photo error:", error);
    res.status(500).json({ error: "PHOTO_DELETE_FAILED" });
  }
});

router.get("/api/photos-metadata", requireAuthenticatedUser, async (req, res) => {
  try {
    const photos = await listPhotosByUser(req.user.id);
    res.json(photos.map(mapPhotoInfo));
  } catch (error) {
    console.error("Photos metadata error:", error);
    res.status(500).json({ error: "PHOTOS_METADATA_FAILED" });
  }
});

router.get("/api/photos/:id/file", requireAuthenticatedUser, async (req, res) => {
  try {
    const photo = await findPhotoByFilenameAndUser(req.params.id, req.user.id);

    if (!photo || !fs.existsSync(photo.storage_path)) {
      return res.status(404).json({ error: "Photo not found" });
    }

    res.sendFile(photo.storage_path);
  } catch (error) {
    console.error("Get photo by id file error:", error);
    res.status(500).json({ error: "PHOTO_FILE_FAILED" });
  }
});

router.get("/api/photos/:id/info", requireAuthenticatedUser, async (req, res) => {
  try {
    const photo = await findPhotoByFilenameAndUser(req.params.id, req.user.id);

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

    res.json(mapPhotoInfo(photo));
  } catch (error) {
    console.error("Photo info error:", error);
    res.status(500).json({ error: "PHOTO_INFO_FAILED" });
  }
});

router.post("/api/photos/:id/process", requireAuthenticatedUser, async (req, res) => {
  const timer = createRequestTimer("photo-process");
  const photo = await findPhotoByFilenameAndUser(req.params.id, req.user.id);

  if (!photo) {
    timer.log("photo_not_found", {
      filename: req.params.id
    });
    return res.status(404).json({ error: "Photo not found" });
  }

  timer.log("photo_loaded", {
    filename: photo.filename,
    status: photo.status,
    sizeBytes: photo.size_bytes
  });

  const alreadyProcessed =
    photo.status === "processed" &&
    (photo.title?.trim() || photo.summary?.trim() || (Array.isArray(photo.tags) && photo.tags.length > 0));

  if (alreadyProcessed) {
    timer.log("already_processed");
    return res.json({
      status: photo.status,
      title: photo.title || "",
      summary: photo.summary || "",
      category: photo.category || "",
      section: photo.section || "",
      topic: photo.topic || "",
      tags: Array.isArray(photo.tags) ? photo.tags : [],
      cleanText: photo.clean_text || "",
      textQuality: photo.text_quality || "",
      notes: photo.ai_notes || ""
    });
  }

  const guardError = getProcessingGuardError(req.user);

  if (guardError) {
    timer.log("guard_rejected", {
      error: guardError
    });
    return res.status(403).json({
      status: "error",
      error: guardError
    });
  }

  try {
    await updatePhotoStatus(photo.id, "processing", null);
    const imagePath = photo.storage_path;
    timer.log("ocr_started", {
      provider: OCR_PROVIDER
    });

    const rawOcrResult = await ocrService.recognize(imagePath, {
      provider: OCR_PROVIDER,
      apiKey: YANDEX_API_KEY,
      folderId: YANDEX_FOLDER_ID
    });

    timer.log("ocr_finished", {
      provider: OCR_PROVIDER
    });

    const ocrResult = normalizeOcrResult(rawOcrResult);

    if (ocrResult.error) {
      console.error("OCR ERROR:", ocrResult.error);
      await updatePhotoStatus(photo.id, "error", ocrResult.error);
      timer.log("response_ocr_error", {
        error: ocrResult.error
      });

      return res.json({
        status: "error",
        error: ocrResult.error
      });
    }

    const text = ocrResult.text || "";

    if (text.trim().length < 10) {
      await updatePhotoProcessingResult(photo.id, {
        status: "no_text",
        ocrText: text,
        errorMessage: null,
        processedAt: new Date()
      });

      timer.log("response_no_text", {
        textLength: text.trim().length
      });

      return res.json({ message: "No text detected", status: "no_text" });
    }

    timer.log("ai_started", {
      provider: AI_PROVIDER,
      textLength: text.trim().length
    });

    const aiResult = await aiService.process(text, {
      provider: AI_PROVIDER,
      apiKey: YANDEX_API_KEY,
      folderId: YANDEX_FOLDER_ID,
      openAiApiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL
    });

    timer.log("ai_finished", {
      provider: AI_PROVIDER
    });

    if (aiResult.error) {
      console.error("AI ERROR:", aiResult.error);
      await updatePhotoProcessingResult(photo.id, {
        status: "error",
        ocrText: text,
        errorMessage: aiResult.error,
        processedAt: new Date()
      });

      timer.log("response_ai_error", {
        error: aiResult.error
      });

      return res.json({
        status: "error",
        error: aiResult.error
      });
    }

    const updatedPhoto = await updatePhotoProcessingResult(photo.id, {
      status: "processed",
      ocrText: text,
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

    return res.json({
      status: updatedPhoto.status,
      title: updatedPhoto.title,
      summary: updatedPhoto.summary,
      category: updatedPhoto.category || "",
      section: updatedPhoto.section || "",
      topic: updatedPhoto.topic || "",
      tags: Array.isArray(updatedPhoto.tags) ? updatedPhoto.tags : [],
      cleanText: updatedPhoto.clean_text || "",
      textQuality: updatedPhoto.text_quality || "",
      notes: updatedPhoto.ai_notes || ""
    });
  } catch (err) {
    console.error("PROCESS ERROR:", err);

    let errorMessage = "Processing failed";

    if (err.code === "insufficient_quota") {
      errorMessage = "AI quota exceeded";
    }

    if (err.status === 429) {
      errorMessage = "Too many requests or quota exceeded";
    }

    await updatePhotoStatus(photo.id, "error", errorMessage);

    timer.log("response_failed", {
      error: errorMessage
    });

    res.status(200).json({
      id: photo.filename,
      status: "error",
      error: errorMessage
    });
  }
});

export default router;
