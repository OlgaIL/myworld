import path from "node:path";
import fs from "node:fs/promises";
import { query, withTransaction } from "../db/index.js";
import { guestUploadsDir, uploadsDir } from "../config/paths.js";
import { getGuestDocumentExpiryDate } from "../utils/guest.js";
import { managedFile, removeManagedFile } from "./guestStorageFiles.js";
import { beginFileIntent, acquireFileIntentLock } from "../repositories/guestFileIntentsRepository.js";
import { acquireAccountOperationLock } from "./accountOperationLocks.js";
import { acquireGuestStorageLock } from "./guestStorageLocks.js";

export async function registerGuestUpload(sessionId, filename) {
  const destinationPath = await managedFile(path.join(guestUploadsDir, filename));
  const createdAt = new Date();
  return beginFileIntent({ kind: "upload", guestSessionId: sessionId, destinationPath,
    createdAt, expiresAt: getGuestDocumentExpiryDate(createdAt) });
}

const canonical = (file) => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);

// Called with the shared maintenance lock already held. Only registered paths
// are candidates; no directory/age sweep, including within users/.
export async function cleanupFileIntents({ dryRun = true, batchSize = 100, remove = removeManagedFile, log = console.log } = {}) {
  const counts = { intentsFinished: 0, intentFilesRemoved: 0, busy: 0, errors: 0 };
  let lastId = "00000000-0000-0000-0000-000000000000";
  while (true) {
    const candidates = await query(`select * from guest_file_intents where id > $1::uuid
      and (expires_at <= now() or cancelled_at is not null) order by id limit $2`, [lastId, batchSize]);
    if (!candidates.rows.length) break;
    for (const item of candidates.rows) {
      lastId = item.id;
      let releaseAccount, releaseSession, releaseIntent;
      try {
        if (item.user_id) {
          releaseAccount = await acquireAccountOperationLock(item.user_id);
          if (!releaseAccount) { counts.busy++; continue; }
        }
        if (item.guest_session_id) {
          releaseSession = await acquireGuestStorageLock(item.guest_session_id, { tryOnly: true });
          if (!releaseSession) { counts.busy++; continue; }
        }
        releaseIntent = await acquireFileIntentLock(item.id, { tryOnly: true });
        if (!releaseIntent) { counts.busy++; continue; }
        const result = await withTransaction(async (client) => {
          await client.query("set local lock_timeout = '3s'");
          const current = (await client.query(`select * from guest_file_intents where id = $1
            and (expires_at <= now() or cancelled_at is not null) for update`, [item.id])).rows[0];
          if (!current) return null;
          // Prevent a new reference or writer intent racing the check/unlink.
          await client.query("lock table photos, guest_documents, guest_document_claims, guest_storage_retirements, guest_file_intents in share row exclusive mode");
          const references = await client.query(`select storage_path from photos union select storage_path from guest_documents
            union select source_path from guest_document_claims where source_path is not null
            union select storage_path from guest_storage_retirements
            union select destination_path from guest_file_intents where id <> $1
            union select source_path from guest_file_intents where id <> $1 and source_path is not null
            union select temporary_path from guest_file_intents where id <> $1 and temporary_path is not null`, [item.id]);
          const protectedPaths = new Set(references.rows.map((row) => canonical(row.storage_path)));
          let removed = 0;
          for (const file of [current.temporary_path, current.destination_path].filter(Boolean)) {
            await managedFile(file, current.kind === "upload" ? ["guests"] : ["guests", "users"]);
            const referenced = protectedPaths.has(canonical(file));
            log(JSON.stringify({ id: item.id, path: path.relative(uploadsDir, file).split(path.sep).join("/"),
              action: referenced ? "preserve-referenced" : dryRun ? "would-remove-registered-file" : "remove-registered-file" }));
            if (!dryRun && !referenced) {
              const exists = await fs.lstat(file).then(() => true).catch((error) => { if (error.code !== "ENOENT") throw error; return false; });
              await remove(file, current.kind === "upload" ? ["guests"] : ["guests", "users"]);
              if (process.platform !== "win32") {
                const directory = await fs.open(path.dirname(file), "r");
                try { await directory.sync(); } finally { await directory.close(); }
              }
              if (exists) removed++;
            }
          }
          if (!dryRun) await client.query("delete from guest_file_intents where id = $1", [item.id]);
          return { removed, finished: !dryRun };
        });
        if (result) { counts.intentFilesRemoved += result.removed; if (result.finished) counts.intentsFinished++; }
      } catch (error) { counts.errors++; log(JSON.stringify({ id: item.id, code: error.code || "INTENT_CLEANUP_ERROR" })); }
      finally {
        if (releaseIntent) await releaseIntent();
        if (releaseSession) await releaseSession();
        if (releaseAccount) await releaseAccount();
      }
    }
  }
  return counts;
}
