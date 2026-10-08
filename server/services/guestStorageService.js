import path from "node:path";
import { query, withTransaction } from "../db/index.js";
import { guestUploadsDir, userUploadsDir, ensurePrivateUploadDirectories } from "../config/paths.js";
import { durableCopy, removeManagedFile } from "./guestStorageFiles.js";

const contentColumns = [
  "mime_type", "size_bytes", "ocr_provider", "ai_provider", "ocr_text", "title",
  "summary", "category", "section", "topic", "tags", "clean_text", "formatted_content",
  "formatted_at", "has_table", "has_formulas", "has_recognition_errors", "corrections",
  "text_quality", "ai_notes", "error_message", "processed_at", "created_at"
];

// Caller holds the guest-session advisory lock. Only local IO in transaction.
export async function transferGuestDocument(id, userId, { copy = durableCopy, transaction = withTransaction } = {}) {
  ensurePrivateUploadDirectories();
  let destination;
  try { return await transaction(async (client) => {
    const result = await client.query("select * from guest_documents where id = $1 and expires_at > now() for update", [id]);
    const document = result.rows[0];
    if (!document || document.status === "claimed") return null;
    const filename = document.filename;
    destination = path.join(userUploadsDir, `claimed-${document.id}-${path.basename(filename)}`);
    await copy(document.storage_path, destination, undefined, { userId, guestSessionId: document.guest_session_id,
      guestDocumentId: document.id, expiresAt: document.expires_at });
    const status = document.status === "processing" ? (document.ocr_text ? "recognized" : "error") : document.status;
    const photoResult = await client.query(`
      insert into photos (user_id, filename, storage_path, status, ${contentColumns.join(", ")})
      select $2, $3, $4, $5, ${contentColumns.join(", ")} from guest_documents where id = $1
      returning *`, [id, userId, filename, destination, status]);
    const photo = photoResult.rows[0];
    await client.query(`insert into guest_document_claims
      (guest_document_id, guest_session_id, photo_id, user_id, expires_at, source_path)
      values ($1, $2, $3, $4, $5, $6)`,
    [id, document.guest_session_id, photo.id, userId, document.expires_at, document.storage_path]);
    await client.query("delete from guest_documents where id = $1", [id]);
    await client.query("update users set documents_created_total = documents_created_total + 1, updated_at = now() where id = $1", [userId]);
    return photo;
  }); } catch (error) {
    // COMMIT may have succeeded before the connection broke. Never remove a
    // possibly committed copy without confirming that it has no archive link.
    if (destination && !["REFERENCED_COPY_DESTINATION", "UNOWNED_COPY_DESTINATION"].includes(error.code)) {
      try {
        const references = await query("select 1 from photos where storage_path = $1 union all select 1 from guest_documents where storage_path = $1 limit 1", [destination]);
        const owned = await query(`select 1 from guest_file_intents where kind = 'copy' and guest_document_id = $1
          and user_id = $2 and destination_path = $3 limit 1`, [id, userId, destination]);
        if (!references.rows.length && owned.rows.length) await removeManagedFile(destination, ["users"]);
      } catch (cleanupError) {
        console.error("Guest prepared copy cleanup:", { id, code: cleanupError.code || "COPY_CLEANUP_ERROR" });
      }
    }
    throw error;
  }
}

export async function finishClaimSourceRemoval(claim, { remove = removeManagedFile } = {}) {
  if (!claim.source_path || path.dirname(claim.source_path) !== guestUploadsDir) return false;
  const references = await query(`select 1 from photos where storage_path = $1
    union all select 1 from guest_documents where storage_path = $1 limit 1`, [claim.source_path]);
  if (references.rows.length) return false;
  await remove(claim.source_path);
  await query("update guest_document_claims set source_path = null where guest_document_id = $1 and source_path = $2", [claim.guest_document_id, claim.source_path]);
  return true;
}
