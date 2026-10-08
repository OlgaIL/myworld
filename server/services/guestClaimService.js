import { query, withTransaction } from "../db/index.js";
import { findGuestSessionByToken } from "../repositories/guestSessionsRepository.js";
import { GUEST_SESSION_COOKIE_NAME, parseCookies } from "../utils/guest.js";
import { acquireGuestStorageLock } from "./guestStorageLocks.js";
import { transferGuestDocument, finishClaimSourceRemoval } from "./guestStorageService.js";
import { acquireAccountOperationLock } from "./accountOperationLocks.js";
import { findUserById } from "../repositories/usersRepository.js";
import { updatePhotoProcessingResult } from "../repositories/photosRepository.js";
import { enrichWithPipeline, getProcessingPipelineForUser } from "./processingPipelineService.js";
import { getProcessingGuardError } from "../utils/photos.js";

export function canRunAiForGuestClaim(user, document, pipeline, guard = getProcessingGuardError) {
  if (!document || document.status !== "processed" || String(document.ocr_text || "").trim().length < 10) return false;
  if (document.title || document.summary || document.clean_text) return false;
  return !guard(user, pipeline);
}

async function enrichPendingClaims(sessionId, userId, { enrich, guard, pipelineForUser }) {
  const user = await findUserById(userId);
  const pipeline = pipelineForUser(user);
  const pending = await query(`select p.*, p.updated_at::text as claim_revision, c.guest_document_id
    from guest_document_claims c join photos p on p.id = c.photo_id
    where c.guest_session_id = $1 and c.user_id = $2 and p.user_id = $2 and c.enrichment_state = 'pending'`, [sessionId, userId]);
  const results = [];
  for (const photo of pending.rows) {
    if (!canRunAiForGuestClaim(user, photo, pipeline, guard)) {
      // A disabled service can be retried on a later login. Existing results,
      // short text and non-eligible statuses never trigger another paid call.
      if (!canRunAiForGuestClaim(user, photo, pipeline, () => null)) {
        await query("update guest_document_claims set enrichment_state = 'done' where guest_document_id = $1", [photo.guest_document_id]);
      }
      continue;
    }
    let ai;
    try { ai = await enrich(photo.ocr_text, pipeline, { trigger: "claim" }); }
    catch { ai = { error: "CLAIM_ENRICHMENT_FAILED" }; }
    // The network call is outside this short transaction. Both account and
    // guest-session locks remain held, including after socket disconnection.
    const updated = await withTransaction(async (client) => {
      const current = (await client.query("select *, updated_at::text as claim_revision from photos where id = $1 and user_id = $2 for update", [photo.id, userId])).rows[0];
      if (!current) return null;
      if (current.claim_revision !== photo.claim_revision) {
        await client.query("update guest_document_claims set enrichment_state = 'done' where guest_document_id = $1", [photo.guest_document_id]);
        return current; // Never overwrite a newer user processing/correction.
      }
      const updates = ai.error ? { status: "error", ocrText: photo.ocr_text, errorMessage: ai.error, processedAt: new Date() }
        : { status: "processed", ocrText: photo.ocr_text, title: ai.title, summary: ai.summary, category: ai.category,
          section: ai.section, topic: ai.topic, tags: ai.tags, cleanText: ai.cleanText, formattedContent: ai.formattedContent,
          hasTable: ai.hasTable, hasFormulas: ai.hasFormulas, hasRecognitionErrors: ai.hasRecognitionErrors,
          corrections: ai.corrections, textQuality: ai.textQuality, aiNotes: ai.notes, errorMessage: null, processedAt: new Date() };
      const result = await updatePhotoProcessingResult(photo.id, updates, { client });
      await client.query("update guest_document_claims set enrichment_state = $2 where guest_document_id = $1", [photo.guest_document_id, ai.error ? "failed" : "done"]);
      return result;
    });
    if (updated) results.push(updated);
  }
  return results;
}

export async function claimGuestDocumentForUser(req, { enrich = enrichWithPipeline, guard = getProcessingGuardError,
  pipelineForUser = getProcessingPipelineForUser } = {}) {
  const userId = req.user?.id;
  const token = parseCookies(req.headers.cookie)[GUEST_SESSION_COOKIE_NAME];
  if (!userId || !token) return null;
  const releaseAccount = await acquireAccountOperationLock(userId);
  if (!releaseAccount) throw Object.assign(new Error("ACCOUNT_BUSY"), { code: "ACCOUNT_BUSY" });
  try {
    const user = await query("select id from users where id = $1", [userId]);
    if (!user.rows.length) return null;
    const session = await findGuestSessionByToken(token);
    if (!session) return null;
    const release = await acquireGuestStorageLock(session.id);
    try {
      const current = await findGuestSessionByToken(token);
      if (!current) return null;
      if (current.converted_user_id && String(current.converted_user_id) !== String(userId)) return null;
      await query("update guest_sessions set converted_user_id = $2, last_seen_at = now() where id = $1", [session.id, userId]);
      const documents = await query("select id from guest_documents where guest_session_id = $1 and status <> 'claimed' and expires_at > now() order by id", [session.id]);
      const photos = [];
      for (const { id } of documents.rows) {
        const photo = await transferGuestDocument(id, userId);
        if (photo) photos.push(photo);
      }
      const pending = await query("select * from guest_document_claims where guest_session_id = $1 and source_path is not null", [session.id]);
      for (const claim of pending.rows) {
        try { await finishClaimSourceRemoval(claim); }
        catch (error) { console.error("Guest claim source cleanup:", { id: claim.guest_document_id, code: error.code || "IO_ERROR" }); }
      }
      const enriched = await enrichPendingClaims(session.id, userId, { enrich, guard, pipelineForUser });
      for (const result of enriched) {
        const index = photos.findIndex((photo) => String(photo.id) === String(result.id));
        if (index >= 0) photos[index] = result; else photos.push(result);
      }
      return photos;
    } finally { await release(); }
  } finally { await releaseAccount(); }
}
