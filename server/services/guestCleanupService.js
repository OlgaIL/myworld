import { query, withTransaction } from "../db/index.js";
import path from "node:path";
import { guestUploadsDir, ensurePrivateUploadDirectories } from "../config/paths.js";
import { acquireGuestStorageLock } from "./guestStorageLocks.js";
import { removeManagedFile, managedFile } from "./guestStorageFiles.js";
import { finishClaimSourceRemoval } from "./guestStorageService.js";
import { cleanupFileIntents } from "./guestFileIntentService.js";
import crypto from "node:crypto";
import { recordGuestFileRemoval, recordTtlDocument } from "./guestStatisticsService.js";

async function performCleanup({ dryRun = true, batchSize = 100, remove = removeManagedFile, log = console.log, runId = null } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("INVALID_BATCH_SIZE");
  const counts = { candidates: 0, deleted: 0, sourcesRemoved: 0, busy: 0, legacy: 0, errors: 0, dryRun };
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
              await recordGuestFileRemoval(document.storage_path, { remove, runId, category: "ttl" });
              await client.query("delete from guest_documents where id = $1", [document.id]);
              await recordTtlDocument(client, document.id);
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
          if (!dryRun && await finishClaimSourceRemoval(claim, { remove, runId })) counts.sourcesRemoved++;
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
            await recordGuestFileRemoval(item.storage_path, { remove, runId, category: "source" });
            await query("delete from guest_storage_retirements where storage_path = $1", [item.storage_path]);
            counts.sourcesRemoved++;
          }
        } catch (error) { counts.errors++; log(JSON.stringify({ code: error.code || "REPLACEMENT_CLEANUP_ERROR" })); }
        finally { await release(); }
      }
    }
    const artifacts = await cleanupFileIntents({ dryRun, batchSize, remove, log, runId });
    counts.busy += artifacts.busy;
    counts.errors += artifacts.errors;
    return { ...counts, intentsFinished: artifacts.intentsFinished, intentFilesRemoved: artifacts.intentFilesRemoved };
}

export async function cleanupGuests(options = {}) {
  const dryRun = options.dryRun ?? true;
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("INVALID_BATCH_SIZE");
  const runId = dryRun ? null : crypto.randomUUID();
  if (runId) await query("insert into guest_cleanup_runs(id,state) values ($1,'running')", [runId]);
  let releaseJob, heartbeat;
  let heartbeatFailed = false;
  try {
    releaseJob = await acquireGuestStorageLock("maintenance", { maintenance: true, tryOnly: true });
    if (!releaseJob) {
      const counts = { candidates: 0, deleted: 0, sourcesRemoved: 0, busy: 1, legacy: 0, errors: 0, dryRun };
      if (runId) await query("update guest_cleanup_runs set state='busy',finished_at=now(),counters=$2 where id=$1", [runId, JSON.stringify(counts)]);
      return counts;
    }
    if (runId) {
      await query("update guest_cleanup_runs set lock_pid=$2 where id=$1", [runId, releaseJob.pid]);
      heartbeat = setInterval(() => {
        query("update guest_cleanup_runs set heartbeat_at=now() where id=$1", [runId]).catch(() => { heartbeatFailed = true; });
      }, 30000);
      heartbeat.unref();
    }
    const counts = await performCleanup({ ...options, dryRun, runId });
    if (runId) {
      const files = (await query(`select count(*) filter(where result='removed')::int as removed,
        count(*) filter(where result='missing')::int as missing,
        count(*) filter(where incomplete or result in ('pending','unknown'))::int as incomplete
        from guest_file_deletions where run_id=$1`, [runId])).rows[0];
      counts.filesRemoved = files.removed;
      counts.filesMissing = files.missing;
      const recorded = (await query("select incomplete from guest_cleanup_runs where id=$1", [runId])).rows[0];
      counts.incomplete = Boolean(files.incomplete || heartbeatFailed || recorded.incomplete);
      const state = counts.errors || counts.legacy || counts.incomplete ? "errors" : counts.busy ? "busy" : "success";
      counts.state = state;
      await query("update guest_cleanup_runs set state=$2,heartbeat_at=now(),finished_at=now(),counters=$3,incomplete=$4 where id=$1", [runId, state, JSON.stringify(counts), counts.incomplete]);
    }
    return counts;
  } catch (error) {
    if (runId) await query("update guest_cleanup_runs set state='errors',finished_at=now(),incomplete=true,counters=jsonb_build_object('errors',1) where id=$1", [runId]).catch(() => {});
    throw error;
  } finally {
    clearInterval(heartbeat);
    if (releaseJob) await releaseJob();
  }
}
