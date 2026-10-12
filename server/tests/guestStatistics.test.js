import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import express from "express";
import dotenv from "dotenv";
dotenv.config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "LOCAL_DATABASE_REQUIRED");
assert.equal(process.env.NODE_ENV, "test");
assert.ok(process.env.MYWORLD_TEST_UPLOADS_DIR, "DISPOSABLE_UPLOADS_REQUIRED");
const schema = `guest_statistics_test_${crypto.randomUUID().replaceAll("-", "")}`;
const bootstrap = new pg.Pool({ connectionString: url.toString() });
await bootstrap.query(`create schema ${schema}`);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
const pipeline = process.env.GUEST_STATS_TEST_PIPELINE || "standard";
Object.assign(process.env, { ADMIN_ENABLED: "true", ADMIN_LOGIN: "synthetic", ADMIN_PASSWORD: "synthetic",
  PROCESSING_ENABLED: "true", PROCESSING_MODE_OVERRIDE: pipeline, PROCESSING_GUEST_AI_PROVIDER: "openai",
  PROCESSING_STANDARD_AI_PROVIDER: "openai", PROCESSING_GUEST_OCR_PROVIDER: "yandex", OPENAI_ENABLED: "true",
  YANDEX_OCR_ENABLED: "true", YANDEX_API_KEY: "synthetic", YANDEX_FOLDER_ID: "synthetic", OPENAI_API_KEY: "synthetic",
  GUEST_DOCUMENT_LIMIT: "100", GUEST_DOCUMENT_TTL_HOURS: "240", GUEST_CLEANUP_TIMEZONE: "Europe/Istanbul",
  TIMEWEB_API_KEY: "", TELEGRAM_BOT_TOKEN: "", SMTP_PASSWORD: "", YANDEX_METRIKA_API_ENABLED: "false" });
globalThis.__myworldEnvLoaded = true;
const { query, withTransaction, closeDatabaseConnection } = await import("../db/index.js");
const { guestUploadsDir, ensurePrivateUploadDirectories } = await import("../config/paths.js");
const { cleanupGuests } = await import("../services/guestCleanupService.js");
const { getGuestStorageSummary, scheduleStatus, recordGuestFileRemoval } = await import("../services/guestStatisticsService.js");
const { removeManagedFile } = await import("../services/guestStorageFiles.js");
const { acquireGuestStorageLock, closeGuestStorageLocks } = await import("../services/guestStorageLocks.js");
const { closeFileIntentLocks } = await import("../repositories/guestFileIntentsRepository.js");
const { closeAccountOperationLocks } = await import("../services/accountOperationLocks.js");
const { createGuestDocument, replaceGuestDocumentUpload, updateGuestDocumentStatus, updateGuestDocumentProcessingResult } = await import("../repositories/guestDocumentsRepository.js");
const { transferGuestDocument } = await import("../services/guestStorageService.js");
const guestRoutes = (await import("../routes/guestRoutes.js")).default;
const adminRoutes = (await import("../routes/adminRoutes.js")).default;
const ocr = (await import("../services/ocrService.js")).default;
for (const file of (await fs.readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await query(await fs.readFile(`db/migrations/${file}`, "utf8"));
ensurePrivateUploadDirectories();
let session, behavior = "success";
const nativeFetch = globalThis.fetch;
const originalOcr = ocr.recognize;
ocr.recognize = async () => behavior === "no_text" ? { text: "" } : behavior === "ocr_error" ? { error: "synthetic OCR failure" } : { text: "Synthetic recognized document text" };
globalThis.fetch = async (input, options) => {
  const address = String(input?.url || input);
  if (new URL(address).hostname === "127.0.0.1") return nativeFetch(input, options);
  assert.equal(new URL(address).hostname, "api.openai.com", "Unexpected external request blocked");
  const content = behavior === "ai_error" ? "not JSON" : JSON.stringify({
    ocrText: behavior === "no_text" ? "" : "Synthetic recognized document text",
    cleanText: behavior === "no_text" ? "" : "Synthetic recognized document text",
    textQuality: behavior === "no_text" ? "no_meaningful_text" : "good", title: "Synthetic", tags: []
  });
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
};
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { adminAuthenticated: req.headers["x-synthetic-admin"] === "yes" }; next(); });
app.use(adminRoutes); app.use(guestRoutes);
const http = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
const base = `http://127.0.0.1:${http.address().port}`;
const quiet = () => {};
async function file() {
  const filename = `${crypto.randomUUID()}.jpg`;
  const storagePath = path.join(guestUploadsDir, filename);
  await fs.writeFile(storagePath, "synthetic image");
  return { filename, storagePath, mimeType: "image/jpeg", sizeBytes: 15 };
}
async function document(expired = false) {
  const row = await createGuestDocument({ guestSessionId: session.id, ...await file(), status: "processing" });
  if (expired) await query("update guest_documents set expires_at=now() where id=$1", [row.id]);
  return row;
}
async function upload(replacement = null, type = "image/jpeg") {
  const form = new FormData(); form.set("photo", new Blob(["synthetic image"], { type }), "synthetic.jpg");
  if (replacement) form.set("replaceDocumentId", replacement);
  return fetch(`${base}/api/guest/upload`, { method: "POST", headers: { Cookie: `guest_session_token=${session.session_token}` }, body: form });
}
beforeEach(async () => {
  behavior = "success";
  const tables = (await query("select tablename from pg_tables where schemaname=current_schema()")).rows;
  await query(`truncate ${tables.map((t) => t.tablename).join(",")} cascade`);
  await query("insert into guest_statistics_collection default values");
  session = (await query("insert into guest_sessions(session_token) values($1) returning *", [crypto.randomUUID()])).rows[0];
});
after(async () => {
  globalThis.fetch = nativeFetch; ocr.recognize = originalOcr;
  await new Promise((resolve) => http.close(resolve));
  await closeGuestStorageLocks(); await closeFileIntentLocks(); await closeAccountOperationLocks(); await closeDatabaseConnection();
  await bootstrap.query(`drop schema ${schema} cascade`); await bootstrap.end();
});

test(`HTTP ${pipeline}: acceptance/rejection/replacement and terminal outcomes`, async () => {
  const rejected = await upload(null, "text/plain"); assert.equal(rejected.status, 400);
  assert.equal((await getGuestStorageSummary(24)).period.uploads, 0);
  let response = await upload(); assert.equal(response.status, 200);
  const accepted = (await response.json()).document;
  await updateGuestDocumentStatus(accepted.id, "error", "synthetic replacement allowed");
  response = await upload(accepted.id); assert.equal(response.status, 200);
  let summary = await getGuestStorageSummary(24);
  assert.equal(summary.period.uploads, 2); assert.equal(summary.period.processed, 2);
  assert.equal(summary.period.categories.source.removed, 1);
  behavior = "no_text"; assert.equal((await upload()).status, 200);
  behavior = "ai_error"; assert.equal((await upload()).status, 200);
  summary = await getGuestStorageSummary(24);
  assert.equal(summary.period.no_text, 1);
  assert.equal(summary.period[pipeline === "standard" ? "recognized" : "error"], 1);
  if (pipeline === "standard") {
    behavior = "ocr_error"; assert.equal((await upload()).status, 200);
    assert.equal((await getGuestStorageSummary(24)).period.error, 1);
  }
  const retryDoc = await document();
  await updateGuestDocumentProcessingResult(retryDoc.id, { status: "recognized", ocrText: "Synthetic recognized document text" });
  behavior = "success";
  const before = (await getGuestStorageSummary(24)).period;
  assert.equal((await fetch(`${base}/api/guest/documents/${retryDoc.id}/retry-processing`, { method: "POST", headers: { Cookie: `guest_session_token=${session.session_token}` } })).status, 200);
  const after = (await getGuestStorageSummary(24)).period;
  assert.equal(after.uploads, before.uploads); assert.equal(after.processed, before.processed + 1);
});

test("repository operation UUID dedup, retry and legacy have no invented upload", async () => {
  const doc = await document();
  await updateGuestDocumentProcessingResult(doc.id, { status: "recognized", ocrText: "synthetic" });
  await updateGuestDocumentProcessingResult(doc.id, { status: "recognized", ocrText: "synthetic" });
  await updateGuestDocumentStatus(doc.id, "processing");
  await updateGuestDocumentProcessingResult(doc.id, { status: "processed" });
  let p = (await getGuestStorageSummary(24)).period;
  assert.equal(p.uploads, 1); assert.equal(p.recognized, 1); assert.equal(p.processed, 1);
  await query("alter table guest_documents disable trigger guest_activity");
  const legacy = await document();
  await query("update guest_documents set statistics_upload_id=null, statistics_processing_id=null,status='recognized' where id=$1", [legacy.id]);
  await query("alter table guest_documents enable trigger guest_activity");
  await updateGuestDocumentStatus(legacy.id, "processing"); await updateGuestDocumentStatus(legacy.id, "error");
  p = (await getGuestStorageSummary(24)).period; assert.equal(p.uploads, 1); assert.equal(p.error, 1);
});

test("events roll back with content, replacement is new upload without new TTL", async () => {
  const doc = await document();
  const stop = new Error("rollback");
  await assert.rejects(withTransaction(async (client) => { await client.query("update guest_documents set status='error' where id=$1", [doc.id]); throw stop; }), (e) => e === stop);
  assert.equal((await getGuestStorageSummary(24)).period.error, 0);
  const replaced = await replaceGuestDocumentUpload(doc.id, await file());
  assert.deepEqual(replaced.expires_at, doc.expires_at);
  assert.notEqual(replaced.statistics_upload_id, doc.statistics_upload_id);
  assert.equal((await getGuestStorageSummary(24)).period.uploads, 2);
  await query("update guest_documents set storage_path=$2 where id=$1", [doc.id, (await file()).storagePath]);
  assert.equal((await getGuestStorageSummary(24)).period.uploads, 2, "Administrative path changes are not uploads");
});

test("file path reused after confirmed deletion starts a new opaque operation", async () => {
  const f = await file();
  await recordGuestFileRemoval(f.storagePath, { category: "artifact" });
  await recordGuestFileRemoval(f.storagePath, { category: "artifact" });
  assert.equal((await getGuestStorageSummary(24)).period.filesRemoved, 1);
  await fs.writeFile(f.storagePath, "new synthetic generation");
  await recordGuestFileRemoval(f.storagePath, { category: "artifact" });
  assert.equal((await getGuestStorageSummary(24)).period.filesRemoved, 2);
});

test("PostgreSQL microsecond boundaries include current events and exact expiry", async () => {
  const doc = await document();
  await query("truncate guest_activity_events");
  const fixedNow = "2099-01-02T05:00:00.123789Z";
  const insideNow = "2099-01-02T05:00:00.123456Z";
  const exactStart = "2099-01-01T05:00:00.123789Z";
  const beforeStart = "2099-01-01T05:00:00.123788Z";
  for (const [timestamp, kind, outcome] of [[insideNow, "upload", null], [exactStart, "outcome", "recognized"],
    [beforeStart, "outcome", "error"], [fixedNow, "outcome", "processed"]]) {
    await query("insert into guest_activity_events(operation_id,kind,outcome,occurred_at) values($1,$2,$3,$4)", [crypto.randomUUID(), kind, outcome, timestamp]);
  }
  await query("update guest_documents set expires_at=$2 where id=$1", [doc.id, "2099-01-02T05:00:00.123500Z"]);
  await query(`insert into guest_file_deletions(operation_key,file_key,category,result,confirmed_at)
    values($1,$2,'artifact','removed',$3)`, [crypto.randomUUID(), crypto.randomUUID(), insideNow]);
  const report = await getGuestStorageSummary(24, (callback) => withTransaction((client) => callback({
    query(sql, params) {
      if (sql.includes("from guest_statistics_collection")) {
        // Use a fixed instant inside the actual PostgreSQL clock query. All
        // subsequent aggregation SQL and parameters are the production code.
        return client.query(sql.replaceAll("now()", "$2::timestamptz"), [...params, fixedNow]);
      }
      return client.query(sql, params);
    }
  })));
  assert.equal(report.period.uploads, 1, "Include the event from the current fractional millisecond");
  assert.equal(report.period.recognized, 1, "Include the exact lower bound");
  assert.equal(report.period.error, 0, "Exclude one microsecond before the lower bound");
  assert.equal(report.period.processed, 0, "Exclude the exact upper bound");
  assert.equal(report.period.filesRemoved, 1);
  assert.deepEqual(report.current, { stored: 1, expired: 1 });
});

test("failed prepared copy and temporary copy IO are included as artifacts", async () => {
  const doc = await document();
  const user = (await query("insert into users(email,display_name) values ('artifact@example.test','Synthetic') returning *")).rows[0];
  const originalCopy = fs.copyFile;
  try {
    fs.copyFile = async (_source, temporary) => { await fs.writeFile(temporary, "synthetic partial file"); throw new Error("synthetic copy failed"); };
    await assert.rejects(transferGuestDocument(doc.id, user.id), /synthetic copy failed/);
  } finally { fs.copyFile = originalCopy; }
  assert.equal((await getGuestStorageSummary(24)).period.categories.artifact.removed, 1);
  await query("create table synthetic_commit_guard(id bigint primary key)");
  await query("alter table photos add constraint synthetic_copy_failure foreign key(user_id) references synthetic_commit_guard(id) deferrable initially deferred");
  await assert.rejects(transferGuestDocument(doc.id, user.id), { code: "23503" });
  await query("alter table photos drop constraint synthetic_copy_failure; drop table synthetic_commit_guard");
  assert.equal((await getGuestStorageSummary(24)).period.categories.artifact.removed, 2);
  await transferGuestDocument(doc.id, user.id);
  assert.equal((await getGuestStorageSummary(24)).period.categories.artifact.removed, 2);
});

test("fatal cleanup query exception records failed start without replacing success", async () => {
  await cleanupGuests({ dryRun: false, log: quiet });
  const success = (await getGuestStorageSummary(24)).lastSuccess.id;
  await query("alter table guest_documents rename to synthetic_missing_documents");
  await assert.rejects(cleanupGuests({ dryRun: false, log: quiet }), { code: "42P01" });
  await query("alter table synthetic_missing_documents rename to guest_documents");
  const report = await getGuestStorageSummary(24);
  assert.equal(report.latest.state, "errors"); assert.ok(report.latest.finished_at); assert.equal(report.latest.incomplete, true);
  assert.equal(report.lastSuccess.id, success);
});

test("claim preserves ledger, does not count TTL deletion or archive in current", async () => {
  const doc = await document(); await updateGuestDocumentStatus(doc.id, "processed");
  const user = (await query("insert into users(email,display_name) values ('synthetic@example.test','Synthetic') returning *")).rows[0];
  await transferGuestDocument(doc.id, user.id);
  const report = await getGuestStorageSummary(24);
  assert.equal(report.period.uploads, 1); assert.equal(report.period.processed, 1); assert.equal(report.period.documentsDeleted, 0);
  assert.equal(report.current.stored, 0);
  assert.deepEqual((await query("select expires_at from guest_document_claims")).rows[0].expires_at, doc.expires_at);
});

test("TTL confirmed unlink versus missing, dry-run and repetition", async () => {
  await document(true); const missing = await document(true); await fs.unlink(missing.storage_path);
  await cleanupGuests({ dryRun: true, log: quiet });
  assert.equal((await query("select count(*)::int as n from guest_cleanup_runs")).rows[0].n, 0);
  assert.equal((await getGuestStorageSummary(24)).period.filesRemoved, 0);
  const result = await cleanupGuests({ dryRun: false, log: quiet });
  assert.equal(result.deleted, 2); assert.equal(result.filesRemoved, 1); assert.equal(result.filesMissing, 1);
  assert.equal((await getGuestStorageSummary(24)).latest.state, "success");
  await cleanupGuests({ dryRun: false, log: quiet });
  const report = await getGuestStorageSummary(24);
  assert.equal(report.period.filesRemoved, 1); assert.equal(report.period.documentsDeleted, 2); assert.equal(report.current.expired, 0);
  assert.equal(report.latest.state, "success"); assert.equal(report.latest.counters.deleted, 0);
});

test("unlink-before-finalization crash is incomplete and cannot double count", async () => {
  const doc = await document(true);
  const crashed = await cleanupGuests({ dryRun: false, log: quiet, remove: async (...args) => { await removeManagedFile(...args); throw new Error("synthetic crash after unlink"); } });
  assert.equal(crashed.errors, 1); assert.equal(crashed.incomplete, true);
  assert.equal((await query("select id from guest_documents where id=$1", [doc.id])).rows.length, 1);
  await cleanupGuests({ dryRun: false, log: quiet });
  let report = await getGuestStorageSummary(24);
  assert.equal(report.period.filesRemoved, 0); assert.equal(report.period.filesMissing, 0); assert.equal(report.period.incompleteFiles, 1);
  assert.equal(report.period.documentsDeleted, 1);
  assert.equal(report.latest.incomplete, true); assert.equal(report.latest.state, "errors");
  await cleanupGuests({ dryRun: false, log: quiet }); report = await getGuestStorageSummary(24);
  assert.equal(report.period.filesRemoved, 0); assert.equal(report.period.incompleteFiles, 1);
});

test("document rollback after confirmed unlink retains exact file count and idempotency", async () => {
  const doc = await document(true);
  await query("create function synthetic_delete_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic rollback'; end $$");
  await query("create trigger synthetic_delete_failure before delete on guest_documents for each row execute function synthetic_delete_failure()");
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).errors, 1);
  assert.equal((await getGuestStorageSummary(24)).period.filesRemoved, 1);
  assert.equal((await getGuestStorageSummary(24)).period.documentsDeleted, 0);
  await query("drop trigger synthetic_delete_failure on guest_documents; drop function synthetic_delete_failure()");
  await cleanupGuests({ dryRun: false, log: quiet });
  const report = await getGuestStorageSummary(24); assert.equal(report.period.filesRemoved, 1); assert.equal(report.period.documentsDeleted, 1);
  assert.equal((await query("select id from guest_documents where id=$1", [doc.id])).rows.length, 0);
});

test("busy/errors never replace last success; running lock and interruption", async () => {
  await cleanupGuests({ dryRun: false, log: quiet });
  const successful = (await getGuestStorageSummary(24)).lastSuccess.id;
  const release = await acquireGuestStorageLock("maintenance", { maintenance: true });
  await cleanupGuests({ dryRun: false, log: quiet });
  let report = await getGuestStorageSummary(24); assert.equal(report.latest.state, "busy"); assert.equal(report.lastSuccess.id, successful);
  await release();
  await document(true); const releaseSession = await acquireGuestStorageLock(session.id);
  const busy = await cleanupGuests({ dryRun: false, log: quiet }); assert.equal(busy.busy, 1); await releaseSession();
  await cleanupGuests({ dryRun: false, log: quiet, remove: async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); } });
  assert.equal((await getGuestStorageSummary(24)).lastSuccess.id, successful);
  const job = await acquireGuestStorageLock("maintenance", { maintenance: true });
  const id = crypto.randomUUID();
  await query("insert into guest_cleanup_runs(id,state,lock_pid,heartbeat_at) values($1,'running',$2,now()-interval '3 hours')", [id, job.pid]);
  assert.equal((await getGuestStorageSummary(24)).latest.state, "running"); await job();
  assert.equal((await getGuestStorageSummary(24)).latest.state, "interrupted");
});

test("period boundaries independent current, claimed exception, and no PII columns", async () => {
  await document(true); const claimed = await document(true); await updateGuestDocumentStatus(claimed.id, "claimed");
  await query("update guest_activity_events set occurred_at=now()-interval '25 hours'");
  const small = await getGuestStorageSummary(24), large = await getGuestStorageSummary(48);
  assert.equal(small.period.uploads, 0); assert.equal(large.period.uploads, 2); assert.deepEqual(small.current, large.current);
  assert.deepEqual(small.current, { stored: 1, expired: 1 });
  for (const hours of [168, 720]) assert.equal((await getGuestStorageSummary(hours)).hours, hours);
  const cols = (await query("select column_name from information_schema.columns where table_schema=current_schema() and table_name in ('guest_activity_events','guest_cleanup_runs','guest_file_deletions')")).rows.map((r) => r.column_name);
  assert.ok(!cols.some((name) => /email|path|filename|text_content|token|user_id|document_id|session_id/.test(name)));
});

test("schedule explicit timezone, grace, first run and DST", () => {
  const args = { now: new Date("2026-10-12T03:01:00Z"), collectedAt: new Date("2026-10-11T00:00:00Z"), latest: null, timezone: "Europe/Istanbul" };
  assert.equal(scheduleStatus(args).warning, "missed_schedule");
  assert.equal(scheduleStatus({ ...args, now: new Date("2026-10-12T02:59:00Z") }).warning, null);
  assert.equal(scheduleStatus({ ...args, collectedAt: args.now }).warning, "waiting_first_run");
  assert.equal(scheduleStatus({ ...args, timezone: "" }).warning, "schedule_unconfigured");
  assert.equal(scheduleStatus({ ...args, timezone: "invalid/time" }).warning, "schedule_invalid");
  assert.equal(scheduleStatus({ ...args, timezone: "Europe/Berlin", now: new Date("2026-10-25T05:01:00Z") }).expectedAt.toISOString(), "2026-10-25T04:00:00.000Z");
});

test("HTTP admin auth, strict periods and unavailable migration are honest", async () => {
  assert.equal((await fetch(`${base}/admin-api/guest-storage`)).status, 401);
  const headers = { "x-synthetic-admin": "yes" };
  for (const period of ["1", "24.0", "", "24&hours=48", "NaN"]) assert.equal((await fetch(`${base}/admin-api/guest-storage?hours=${period}`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/admin-api/guest-storage?hours=24`, { headers })).status, 200);
  await query("alter table guest_statistics_collection rename to synthetic_missing_collection");
  assert.equal((await fetch(`${base}/admin-api/guest-storage`, { headers })).status, 503);
  await query("alter table synthetic_missing_collection rename to guest_statistics_collection");
});

test("upload content/ledger failure still responds 500 and retains registered artifact", async () => {
  await query("alter table guest_activity_events rename to synthetic_missing_events");
  await query("alter table guest_file_deletions rename to synthetic_missing_deletions");
  try {
    const response = await upload(); assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "GUEST_UPLOAD_FAILED" });
  } finally {
    await query("alter table synthetic_missing_events rename to guest_activity_events");
    await query("alter table synthetic_missing_deletions rename to guest_file_deletions");
  }
  // Response is sent before the route's asynchronous finally releases locks.
  let intents;
  for (let attempt = 0; attempt < 100; attempt++) {
    intents = (await query("select * from guest_file_intents")).rows;
    if (intents[0]?.cancelled_at) {
      const release = await acquireGuestStorageLock(session.id, { tryOnly: true });
      if (release) { await release(); break; }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(intents.length, 1); assert.ok(intents[0].cancelled_at); await fs.stat(intents[0].destination_path);
  assert.equal((await getGuestStorageSummary(24)).period.uploads, 0);
  await cleanupGuests({ dryRun: false, log: quiet });
  assert.equal((await getGuestStorageSummary(24)).period.categories.artifact.removed, 1);
});
