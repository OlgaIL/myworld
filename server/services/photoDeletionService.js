import crypto from "node:crypto";
import path from "node:path";
import { withTransaction } from "../db/index.js";
import { managedFile } from "./guestStorageFiles.js";
import { cleanupAccountDeletion } from "./accountDeletionCleanupService.js";

export const PHOTO_DELETE_BATCH_SIZE = 100;
const directories = ["legacy", "guests", "users"];
const refusal = (code, status = 409) => Object.assign(new Error(code), { code, status });

export function validateDeletionNames(names) {
  if (!Array.isArray(names) || !names.length || names.length > PHOTO_DELETE_BATCH_SIZE
    || names.some(name => typeof name !== "string" || !name.length || name.length > 255
      || /[\\/\u0000-\u001f]/.test(name) || name === "." || name === "..")) {
    throw refusal("INVALID_DELETE_SELECTION", 400);
  }
  return [...new Set(names)];
}

// The caller holds an exclusive account-operation lock. Persist cleanup in the
// same transaction as deletion; never unlink a surviving document on rollback.
// The existing durable file worker retries IO failures and survives restarts.
export async function deletePhotosForUser(userId, names, {
  transaction = withTransaction, inspectFile = managedFile, cleanup = cleanupAccountDeletion
} = {}) {
  const targets = validateDeletionNames(names);
  const result = await transaction(async client => {
    await client.query("set local lock_timeout = '3s'");
    const maintenance = await client.query("select pg_try_advisory_xact_lock(731241, hashtext('maintenance')) as locked");
    if (!maintenance.rows[0].locked) throw refusal("ACCOUNT_BUSY");
    const deleted = [], missing = [], failed = [];
    const jobId = crypto.randomUUID();
    await client.query("insert into account_deletion_jobs (id) values ($1)", [jobId]);
    for (const name of targets) {
      await client.query("savepoint delete_document");
      try {
        const row = await client.query("select * from photos where user_id = $1 and filename = $2 for update", [userId, name]);
        const photo = row.rows[0];
        if (!photo) { missing.push(name); await client.query("release savepoint delete_document"); continue; }
        const reviews = await client.query("select id, user_id, status from recognition_improvement_requests where photo_id = $1 for update", [photo.id]);
        if (photo.status === "processing" || reviews.rows.some(r => r.status === "in_review")) throw refusal("DOCUMENT_BUSY");
        if (reviews.rows.some(r => String(r.user_id) !== String(userId))) throw refusal("DOCUMENT_SHARED_DATA");
        const claims = await client.query("select * from guest_document_claims where photo_id = $1 for update", [photo.id]);
        const guests = await client.query(`select d.*, s.converted_user_id from guest_documents d
          join guest_sessions s on s.id = d.guest_session_id where d.claimed_photo_id = $1 for update of d`, [photo.id]);
        if (claims.rows.some(c => String(c.user_id) !== String(userId))
          || guests.rows.some(g => String(g.converted_user_id) !== String(userId))) throw refusal("DOCUMENT_SHARED_DATA");
        const files = [...new Set([photo.storage_path, ...claims.rows.map(c => c.source_path),
          ...guests.rows.map(g => g.storage_path)].filter(Boolean).map(file => path.resolve(file)))];
        const intents = await client.query(`select i.* from guest_file_intents i
          where (i.user_id = $1 or (i.user_id is null and exists(select 1 from guest_document_claims c
            where c.photo_id = $2 and c.user_id = $1 and c.guest_document_id = i.guest_document_id
              and c.guest_session_id = i.guest_session_id)))
          and (i.source_path = any($3::text[]) or i.destination_path = any($3::text[])
            or i.temporary_path = any($3::text[])) for update`, [userId, photo.id, files]);
        for (const intent of intents.rows) {
          const locked = await client.query("select pg_try_advisory_xact_lock(731243, hashtext($1)) as locked", [intent.id]);
          if (!locked.rows[0].locked) throw refusal("DOCUMENT_BUSY");
          for (const file of [intent.destination_path, intent.temporary_path].filter(Boolean)) {
            if (!files.includes(path.resolve(file))) files.push(path.resolve(file));
          }
        }
        for (const file of files) await inspectFile(file, directories);
        await client.query(`insert into account_deletion_files (job_id, storage_path)
          select $1, unnest($2::text[]) on conflict do nothing`, [jobId, files]);
        await client.query(`delete from notification_outbox where event_type = 'improvement_requested'
          and entity_id in (select id from recognition_improvement_requests where photo_id = $1)`, [photo.id]);
        // Keep claim tombstones: an old guest cookie must never claim the same
        // upload again. Drop only its now-retired source reference and content.
        await client.query("update guest_document_claims set source_path = null where photo_id = $1", [photo.id]);
        await client.query("delete from guest_file_intents where id = any($1::uuid[])", [intents.rows.map(i => i.id)]);
        await client.query("delete from guest_documents where claimed_photo_id = $1", [photo.id]);
        await client.query("delete from photos where id = $1 and user_id = $2", [photo.id, userId]);
        await client.query(`update users set documents_deleted_total = documents_deleted_total + 1,
          updated_at = now() where id = $1`, [userId]);
        await client.query("release savepoint delete_document");
        deleted.push(name);
      } catch (error) {
        await client.query("rollback to savepoint delete_document");
        await client.query("release savepoint delete_document");
        const code = ["DOCUMENT_BUSY", "DOCUMENT_SHARED_DATA"].includes(error.code) ? error.code
          : String(error.code).startsWith("UNSAFE_") ? "UNSAFE_DOCUMENT_FILE" : "PHOTO_DELETE_FAILED";
        failed.push({ name, code });
      }
    }
    if (!deleted.length) await client.query("delete from account_deletion_jobs where id = $1", [jobId]);
    return { deleted, missing, failed, jobId: deleted.length ? jobId : null };
  });
  let cleanupPending = false;
  if (result.jobId) {
    try {
      const state = await cleanup(result.jobId, { batchSize: 1000, log: () => {} });
      cleanupPending = state?.cleanupPending !== false;
    } catch {
      // The committed job is retried by the worker. Do not pretend that the
      // deleted records still exist just because post-commit file IO failed.
      cleanupPending = true;
    }
  }
  return { deleted: result.deleted, missing: result.missing, failed: result.failed, cleanupPending };
}
