import { AI_PROVIDER, OCR_PROVIDER, OPENAI_MODEL } from "../config/env.js";
import { OPENAI_API_KEY, YANDEX_API_KEY, YANDEX_FOLDER_ID } from "../config/private-env.js";
import { createPhoto, updatePhotoProcessingResult } from "../repositories/photosRepository.js";
import { findLatestActiveGuestDocumentBySessionId, markGuestDocumentClaimed } from "../repositories/guestDocumentsRepository.js";
import { consumeProcessingAccess, findUserById } from "../repositories/usersRepository.js";
import { findGuestSessionByToken, markGuestSessionConverted } from "../repositories/guestSessionsRepository.js";
import * as aiService from "./aiService.js";
import { GUEST_SESSION_COOKIE_NAME, isGuestDocumentExpired, parseCookies } from "../utils/guest.js";
import { getProcessingGuardError } from "../utils/photos.js";

function canRunAiForGuestClaim(user, guestDocument) {
  if (!guestDocument) {
    return false;
  }

  if (guestDocument.status !== "processed") {
    return false;
  }

  const text = guestDocument.ocr_text || "";

  if (text.trim().length < 10) {
    return false;
  }

  return !getProcessingGuardError(user);
}

export async function claimGuestDocumentForUser(req) {
  const userId = req.user?.id;

  if (!userId) {
    return null;
  }

  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[GUEST_SESSION_COOKIE_NAME];

  if (!sessionToken) {
    return null;
  }

  const guestSession = await findGuestSessionByToken(sessionToken);

  if (!guestSession) {
    return null;
  }

  const guestDocument = await findLatestActiveGuestDocumentBySessionId(guestSession.id);

  if (!guestDocument || isGuestDocumentExpired(guestDocument)) {
    return null;
  }

  const initialStatus =
    guestDocument.status === "error" || guestDocument.status === "no_text"
      ? guestDocument.status
      : "processed";

  const claimedPhoto = await createPhoto({
    userId,
    filename: guestDocument.filename,
    storagePath: guestDocument.storage_path,
    mimeType: guestDocument.mime_type,
    sizeBytes: guestDocument.size_bytes,
    status: initialStatus,
    ocrProvider: guestDocument.ocr_provider || OCR_PROVIDER,
    aiProvider: AI_PROVIDER,
    ocrText: guestDocument.ocr_text || "",
    errorMessage: guestDocument.error_message || null,
    processedAt: guestDocument.processed_at || null
  });

  await markGuestDocumentClaimed(guestDocument.id, claimedPhoto.id);
  await markGuestSessionConverted(guestSession.id, userId);

  const freshUser = await findUserById(userId);

  if (!canRunAiForGuestClaim(freshUser, guestDocument)) {
    return claimedPhoto;
  }

  const accessSnapshot = await consumeProcessingAccess(userId);

  if (!accessSnapshot) {
    return claimedPhoto;
  }

  const aiResult = await aiService.process(guestDocument.ocr_text || "", {
    provider: AI_PROVIDER,
    apiKey: YANDEX_API_KEY,
    folderId: YANDEX_FOLDER_ID,
    openAiApiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL
  });

  if (aiResult.error) {
    return updatePhotoProcessingResult(claimedPhoto.id, {
      status: "error",
      ocrText: guestDocument.ocr_text || "",
      errorMessage: aiResult.error,
      processedAt: new Date()
    });
  }

  return updatePhotoProcessingResult(claimedPhoto.id, {
    status: "processed",
    ocrText: guestDocument.ocr_text || "",
    title: aiResult.title,
    summary: aiResult.summary,
    category: aiResult.category,
    tags: aiResult.tags,
    cleanText: aiResult.cleanText,
    textQuality: aiResult.textQuality,
    aiNotes: aiResult.notes,
    errorMessage: null,
    processedAt: new Date()
  });
}
