import { query, withTransaction } from "../db/index.js";
import path from "node:path";
import { guestUploadsDir, ensurePrivateUploadDirectories } from "../config/paths.js";
import { acquireGuestStorageLock } from "./guestStorageLocks.js";
import { removeManagedFile, managedFile } from "./guestStorageFiles.js";
import { finishClaimSourceRemoval } from "./guestStorageService.js";
import { cleanupFileIntents } from "./guestFileIntentService.js";

export async function cleanupGuests({ dryRun = true, batchSize = 100, remove = removeManagedFile, log = console.log } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("INVALID_BATCH_SIZE");
  const releaseJob = await acquireGuestStorageLock("maintenance", { maintenance: true, tryOnly: true });
  const counts = { candidates: 0, deleted: 0, sourcesRemoved: 0, busy: 0, legacy: 0, errors: 0, dryRun };
  if (!releaseJob) return { ...counts, busy: 1 };
  try {
    if (!dryRun) ensurePrivateUploadDirectories();
    let lastId = "0";
    while (true) {
      const batch = await query(`select id, guest_session_id from guest_documents
        where id > $1 and expires_at <= now() and status <> 'claimed' order by id limit $2`, [lastId, batchSize]);
      if (!batch.rows.length) break;
      for (const item of batch.rows) {
        lastId = item.id;
        counts.candidates++;
        const release = await acquireGuestStorageLock(item.guest_session_id, { tryOnly: true });
        if (!release) { counts.busy++; continue; }
        try {
          const deleted = await withTransaction(async (client) => {
            const result = await client.query("select * from guest_documents where id = $1 and expires_at <= now() and status <> 'claimed' for update", [item.id]);
            const document = result.rows[0];
            if (!document) return;
            try { await managedFile(document.storage_path); }
            catch (error) {
              if (error.code === "UNSAFE_STORAGE_PATH") { counts.legacy++; log(JSON.stringify({ id: item.id, action: "transition-required" })); return; }
              throw error;
            }
            const references = await client.query("select 1 from photos where storage_path = $1 union all select 1 from guest_documents where storage_path = $1 and id <> $2 limit 1", [document.storage_path, document.id]);
            if (references.rows.length) throw Object.assign(new Error("SHARED_GUEST_FILE"), { code: "SHARED_GUEST_FILE" });
            log(JSON.stringify({ id: item.id, action: dryRun ? "would-delete" : "delete" }));
            if (!dryRun) {
              // File first. Rollback after an IO error retains the row; an
              // absent file after commit failure is harmless on the next run.
              await remove(document.storage_path);
              await client.query("delete from guest_documents where id = $1", [document.id]);
              return true;
            }
          });
          if (deleted) counts.deleted++;
        } catch (error) { counts.errors++; log(JSON.stringify({ id: item.id, code: error.code || "CLEANUP_ERROR" })); }
        finally { await release(); }
      }
    }
    lastId = "0";
    while (true) {
      const pending = await query("select * from guest_document_claims where guest_document_id > $1 and source_path is not null order by guest_document_id limit $2", [lastId, batchSize]);
      if (!pending.rows.length) break;
      for (const claim of pending.rows) {
        lastId = claim.guest_document_id;
        const release = await acquireGuestStorageLock(claim.guest_session_id, { tryOnly: true });
        if (!release) { counts.busy++; continue; }
        try {
          if (!dryRun && await finishClaimSourceRemoval(claim, { remove })) counts.sourcesRemoved++;
        } catch (error) { counts.errors++; log(JSON.stringify({ id: lastId, code: error.code || "SOURCE_CLEANUP_ERROR" })); }
        finally { await release(); }
      }
    }
    let lastPath = "";
    while (true) {
      const retired = await query("select * from guest_storage_retirements where storage_path > $1 and guest_session_id is not null order by storage_path limit $2", [lastPath, batchSize]);
      if (!retired.rows.length) break;
      for (const item of retired.rows) {
        lastPath = item.storage_path;
        if (path.dirname(item.storage_path) !== guestUploadsDir) continue;
        const release = await acquireGuestStorageLock(item.guest_session_id, { tryOnly: true });
        if (!release) { counts.busy++; continue; }
        try {
          await managedFile(item.storage_path);
          const references = await query("select 1 from photos where storage_path = $1 union all select 1 from guest_documents where storage_path = $1 limit 1", [item.storage_path]);
          if (!dryRun && !references.rows.length) {
            await remove(item.storage_path);
            await query("delete from guest_storage_retirements where storage_path = $1", [item.storage_path]);
            counts.sourcesRemoved++;
          }
        } catch (error) { counts.errors++; log(JSON.stringify({ code: error.code || "REPLACEMENT_CLEANUP_ERROR" })); }
        finally { await release(); }
      }
    }
    const artifacts = await cleanupFileIntents({ dryRun, batchSize, remove, log });
    counts.busy += artifacts.busy;
    counts.errors += artifacts.errors;
    return { ...counts, intentsFinished: artifacts.intentsFinished, intentFilesRemoved: artifacts.intentFilesRemoved };
  } finally { await releaseJob(); }
}
