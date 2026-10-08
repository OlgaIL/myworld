import path from "node:path";
import fs from "node:fs/promises";
import { query, withTransaction } from "../db/index.js";
import { removeManagedFile } from "./guestStorageFiles.js";

const directories = ["legacy", "guests", "users"];
const canonical = (file) => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);

async function durableRemove(file, allowed) {
  await removeManagedFile(file, allowed);
  if (process.platform !== "win32") {
    const directory = await fs.open(path.dirname(file), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
}

export async function getAccountDeletionJob(jobId) {
  const result = await query(`select j.*, (select count(*)::int from account_deletion_files where job_id = j.id) as pending_files,
    exists(select 1 from account_deletion_files where job_id = j.id and last_code is not null) as has_errors
    from account_deletion_jobs j where j.id = $1`, [jobId]);
  const job = result.rows[0];
  return job ? { jobId: job.id, cleanupPending: !job.completed_at, pendingFiles: job.pending_files,
    hasErrors: job.has_errors, removedFiles: job.removed_count, preservedFiles: job.preserved_count } : null;
}

export async function cleanupAccountDeletion(jobId, { remove = durableRemove, batchSize = 100, log = console.log } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("INVALID_BATCH_SIZE");
  const pending = await query("select id from account_deletion_files where job_id = $1 order by id limit $2", [jobId, batchSize]);
  for (const { id } of pending.rows) {
    try {
      await withTransaction(async (client) => {
        const locked = await client.query("select pg_try_advisory_xact_lock(731241, hashtext('maintenance')) as locked");
        if (!locked.rows[0].locked) return;
        await client.query("set local lock_timeout = '3s'");
        const fileResult = await client.query("select * from account_deletion_files where id = $1 for update skip locked", [id]);
        const file = fileResult.rows[0];
        if (!file) return;
        // Short local IO only. Block creation/change of references between the
        // reference check and unlink; also serialize workers on shared files.
        await client.query("lock table photos, guest_documents, guest_document_claims, guest_file_intents in share row exclusive mode");
        const references = await client.query(`select storage_path from photos union select storage_path from guest_documents
          union select source_path as storage_path from guest_document_claims where source_path is not null
          union select destination_path from guest_file_intents
          union select source_path from guest_file_intents where source_path is not null
          union select temporary_path from guest_file_intents where temporary_path is not null`);
        const shared = references.rows.some((row) => canonical(row.storage_path) === canonical(file.storage_path));
        if (!shared) await remove(file.storage_path, directories);
        await client.query("delete from account_deletion_files where id = $1", [id]);
        await client.query(`update account_deletion_jobs set removed_count = removed_count + $2,
          preserved_count = preserved_count + $3 where id = $1`, [jobId, shared ? 0 : 1, shared ? 1 : 0]);
        log(JSON.stringify({ action: "account-file-cleanup", fileId: id, outcome: shared ? "shared-preserved" : "removed" }));
      });
    } catch (error) {
      const code = /^[A-Z0-9_]{1,64}$/.test(String(error.code)) ? error.code : "FILE_CLEANUP_ERROR";
      await query("update account_deletion_files set attempts = attempts + 1, last_code = $2 where id = $1", [id, code]);
      log(JSON.stringify({ action: "account-file-cleanup", fileId: id, outcome: "retry", code }));
    }
  }
  await query(`update account_deletion_jobs set completed_at = coalesce(completed_at, now())
    where id = $1 and not exists(select 1 from account_deletion_files where job_id = $1)`, [jobId]);
  return getAccountDeletionJob(jobId);
}

export async function cleanupPendingAccountDeletions({ dryRun = true, log = console.log } = {}) {
  const jobs = await query("select id from account_deletion_jobs where completed_at is null order by created_at limit 100");
  for (const { id } of jobs.rows) {
    const state = dryRun ? await getAccountDeletionJob(id) : await cleanupAccountDeletion(id, { log });
    log(JSON.stringify({ action: dryRun ? "would-clean-account-files" : "account-cleanup", ...state }));
  }
  return { jobs: jobs.rows.length, dryRun };
}

export function startAccountDeletionCleanupWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await cleanupPendingAccountDeletions({ dryRun: false }); }
    catch (error) { console.error("Account cleanup worker:", { code: error.code || "CLEANUP_ERROR" }); }
    finally { running = false; }
  }, 60000);
  timer.unref();
  return timer;
}
