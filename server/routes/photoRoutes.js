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
  deletePhoto,
  findPhotoByFilenameAndUser,
  listPhotosByUser,
  updatePhotoProcessingResult,
  updatePhotoStatus
} from "../repositories/photosRepository.js";
import * as aiService from "../services/aiService.js";
import ocrService from "../services/ocrService.js";
import { normalizeOcrResult } from "../utils/ocr.js";
import { getProcessingGuardError, mapPhotoInfo } from "../utils/photos.js";

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

router.post("/api/upload", requireAuthenticatedUser, (req, res) => {
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

      res.json({ id: req.file.filename, filename: req.file.filename });
    } catch (error) {
      const filePath = path.join(uploadsDir, req.file.filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

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
  const photo = await findPhotoByFilenameAndUser(req.params.id, req.user.id);

  if (!photo) {
    return res.status(404).json({ error: "Photo not found" });
  }

  const guardError = getProcessingGuardError(req.user);

  if (guardError) {
    return res.status(403).json({
      status: "error",
      error: guardError
    });
  }

  try {
    await updatePhotoStatus(photo.id, "processing", null);
    const imagePath = photo.storage_path;

    const rawOcrResult = await ocrService.recognize(imagePath, {
      provider: OCR_PROVIDER,
      apiKey: YANDEX_API_KEY,
      folderId: YANDEX_FOLDER_ID
    });

    const ocrResult = normalizeOcrResult(rawOcrResult);

    if (ocrResult.error) {
      console.error("OCR ERROR:", ocrResult.error);
      await updatePhotoStatus(photo.id, "error", ocrResult.error);

      return res.json({
        status: "error",
        error: ocrResult.error
      });
    }

    const text = ocrResult.text || "";
    console.log("OCR TEXT:", text.slice(0, 100));

    if (text.trim().length < 10) {
      await updatePhotoProcessingResult(photo.id, {
        status: "no_text",
        ocrText: text,
        errorMessage: null,
        processedAt: new Date()
      });

      return res.json({ message: "No text detected", status: "no_text" });
    }

    const aiResult = await aiService.process(text, {
      provider: AI_PROVIDER,
      apiKey: YANDEX_API_KEY,
      folderId: YANDEX_FOLDER_ID,
      openAiApiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL
    });

    if (aiResult.error) {
      console.error("AI ERROR:", aiResult.error);
      await updatePhotoProcessingResult(photo.id, {
        status: "error",
        ocrText: text,
        errorMessage: aiResult.error,
        processedAt: new Date()
      });

      return res.json({
        status: "error",
        error: aiResult.error
      });
    }

    console.log("AI RESULT:", aiResult);

    const updatedPhoto = await updatePhotoProcessingResult(photo.id, {
      status: "processed",
      ocrText: text,
      title: aiResult.title,
      summary: aiResult.summary,
      tags: aiResult.tags,
      errorMessage: null,
      processedAt: new Date()
    });

    return res.json({
      status: updatedPhoto.status,
      title: updatedPhoto.title,
      summary: updatedPhoto.summary,
      tags: Array.isArray(updatedPhoto.tags) ? updatedPhoto.tags : []
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

    res.status(200).json({
      id: photo.filename,
      status: "error",
      error: errorMessage
    });
  }
});

export default router;
