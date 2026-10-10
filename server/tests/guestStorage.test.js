import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync, fork } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";
import express from "express";
import http from "node:http";

// A disposable schema, exclusively synthetic rows and uniquely named files.
// Fail closed for any remote DB. No production data or paid API is exercised.
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Storage tests require a local PostgreSQL instance");
const prefix = `storage-test-${crypto.randomUUID()}`;
const schema = `storage_test_${crypto.randomUUID().replaceAll("-", "")}`;
const bootstrap = new pg.Pool({ connectionString: url.toString() });
await bootstrap.query(`create schema ${schema}`);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
process.env.GUEST_DOCUMENT_TTL_HOURS = "240";
process.env.OPENAI_API_KEY = "";
process.env.YANDEX_API_KEY = "";
process.env.PROCESSING_MODE_OVERRIDE = "fast";
process.env.PROCESSING_ENABLED = "false";
process.env.TELEGRAM_BOT_TOKEN = "";
globalThis.__myworldEnvLoaded = true;

const { query, withTransaction, closeDatabaseConnection } = await import("../db/index.js");
const { uploadsDir, guestUploadsDir, userUploadsDir } = await import("../config/paths.js");
const { acquireGuestStorageLock, closeGuestStorageLocks } = await import("../services/guestStorageLocks.js");
const { acquireAccountOperationLock, closeAccountOperationLocks } = await import("../services/accountOperationLocks.js");
const { beginFileIntent, cancelFileIntent, closeFileIntentLocks } = await import("../repositories/guestFileIntentsRepository.js");
const { registerGuestUpload } = await import("../services/guestFileIntentService.js");
const { cleanupGuests } = await import("../services/guestCleanupService.js");
const { transitionGuestStorage } = await import("../services/guestStorageTransitionService.js");
const { transferGuestDocument, finishClaimSourceRemoval } = await import("../services/guestStorageService.js");
const { claimGuestDocumentForUser } = await import("../services/guestClaimService.js");
const { durableCopy, removeManagedFile, managedFile } = await import("../services/guestStorageFiles.js");
const { getGuestDocumentExpiryDate, isGuestDocumentExpired } = await import("../utils/guest.js");
const { findUserForAdmin } = await import("../repositories/usersRepository.js");
const { deleteAccount } = await import("../services/accountDeletionService.js");
const guestRoutes = (await import("../routes/guestRoutes.js")).default;
const photoRoutes = (await import("../routes/photoRoutes.js")).default;
for (const name of (await fs.readdir(path.join(serverDir, "db/migrations"))).filter((name) => name.endsWith(".sql")).sort()) {
  await query(await fs.readFile(path.join(serverDir, "db/migrations", name), "utf8"));
}

const files = new Set();
let session, user, appServer, baseUrl;
const quiet = () => {};
const ioError = () => { throw Object.assign(new Error("synthetic denied"), { code: "EACCES" }); };
async function write(directory = guestUploadsDir, label = crypto.randomUUID()) {
  const filename = `${prefix}-${label}.jpg`;
  const storagePath = path.join(directory, filename);
  files.add(storagePath);
  await fs.writeFile(storagePath, "synthetic image");
  return { filename, storagePath };
}
async function document({ directory = guestUploadsDir, expired = false, status = "processed", storagePath = null, sessionId = session.id } = {}) {
  const file = storagePath ? { filename: path.basename(storagePath), storagePath } : await write(directory);
  return (await query(`insert into guest_documents (guest_session_id, filename, storage_path, status, ocr_text, clean_text, title,
    formatted_content, corrections, tags, created_at, expires_at)
    values ($1,$2,$3,$4,'synthetic OCR','synthetic clean','synthetic title',
    '{"blocks":[{"type":"paragraph","text":"synthetic clean"}]}','[]','["synthetic"]',
    now() - ($5::int * interval '1 hour'), now() + ($6::int * interval '1 hour')) returning *`,
  [sessionId, file.filename, file.storagePath, status, expired ? 241 : 1, expired ? -1 : 239])).rows[0];
}
async function photo(storagePath = null) {
  const file = storagePath ? { filename: path.basename(storagePath), storagePath } : await write(userUploadsDir);
  return (await query("insert into photos (user_id, filename, storage_path, status) values ($1,$2,$3,'processed') returning *", [user.id, file.filename, file.storagePath])).rows[0];
}
const request = () => ({ user: { id: user.id }, headers: { cookie: `guest_session_token=${session.session_token}` } });
async function rememberPaths() {
  for (const table of ["photos", "guest_documents"]) {
    for (const row of (await query(`select storage_path from ${table}`)).rows) if (path.isAbsolute(row.storage_path) && row.storage_path.startsWith(uploadsDir + path.sep)) files.add(row.storage_path);
  }
  for (const row of (await query("select destination_path, temporary_path from guest_file_intents")).rows) {
    for (const file of [row.destination_path, row.temporary_path].filter(Boolean)) files.add(file);
  }
}
beforeEach(async () => {
  await rememberPaths();
  const tables = (await query("select tablename from pg_tables where schemaname = current_schema()")).rows;
  await query(`truncate ${tables.map((row) => row.tablename).join(",")} cascade`);
  session = (await query("insert into guest_sessions (session_token) values ($1) returning *", [crypto.randomUUID()])).rows[0];
  user = (await query("insert into users (email, display_name) values ($1,'Synthetic') returning *", [`${prefix}@example.test`])).rows[0];
});
after(async () => {
  if (appServer) await new Promise((resolve) => appServer.close(resolve));
  await rememberPaths();
  await closeGuestStorageLocks();
  await closeFileIntentLocks();
  await closeAccountOperationLocks();
  await closeDatabaseConnection();
  await bootstrap.query(`drop schema ${schema} cascade`);
  await bootstrap.end();
  for (const file of files) await fs.unlink(file).catch((error) => { if (error.code !== "ENOENT") throw error; });
});

test("240 exact elapsed hours and boundary, including a DST date", () => {
  const from = new Date("2026-10-24T13:00:00Z");
  const expiry = getGuestDocumentExpiryDate(from);
  assert.equal(expiry.getTime() - from.getTime(), 240 * 3600000);
  assert.equal(isGuestDocumentExpired({ expires_at: expiry }, new Date(expiry.getTime() - 1)), false);
  assert.equal(isGuestDocumentExpired({ expires_at: expiry }, expiry), true);
});

test("HTTP ownership, expiry, renewed upload cookie, replacement/retry do not extend old documents", async () => {
  const app = express();
  app.use(express.json());
  app.use(guestRoutes);
  app.use((req, res, next) => { req.user = { id: user.id, processingEnabled: true }; req.isAuthenticated = () => true; next(); });
  app.use(photoRoutes);
  appServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  baseUrl = `http://127.0.0.1:${appServer.address().port}`;
  const old = await document({ status: "error" });
  const cookie = { Cookie: request().headers.cookie };
  assert.equal((await fetch(`${baseUrl}/api/guest/documents/${old.id}/file`, { headers: cookie })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/guest/documents/${old.id}/file`, { headers: { Cookie: "guest_session_token=foreign" } })).status, 404);
  const foreign = await fetch(`${baseUrl}/api/guest/document`, { headers: { Cookie: "guest_session_token=foreign" } });
  assert.equal(foreign.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await foreign.json()).documents, []);
  const upload = async (replaceId) => {
    const body = new FormData();
    body.set("photo", new Blob(["synthetic image"], { type: "image/jpeg" }), "synthetic.jpg");
    if (replaceId) body.set("replaceDocumentId", replaceId);
    const response = await fetch(`${baseUrl}/api/guest/upload`, { method: "POST", headers: cookie, body });
    assert.equal(response.status, 200);
    const result = await response.json();
    files.add(path.join(guestUploadsDir, result.document.filename));
    return { response, result };
  };
  const { response, result } = await upload();
  assert.match(response.headers.get("set-cookie"), /Max-Age=864000/);
  assert.ok(new Date(result.document.expiresAt).getTime() <= Date.now() + 864000000);
  const latest = (await query("select created_at, expires_at from guest_documents where id=$1", [result.document.id])).rows[0];
  assert.equal(latest.expires_at.getTime() - latest.created_at.getTime(), 864000000);
  assert.equal(new Date((await query("select expires_at from guest_documents where id=$1", [old.id])).rows[0].expires_at).getTime(), new Date(old.expires_at).getTime());
  await upload(old.id);
  assert.equal(new Date((await query("select expires_at from guest_documents where id=$1", [old.id])).rows[0].expires_at).getTime(), new Date(old.expires_at).getTime());
  await query("update guest_documents set status='recognized', ocr_text='synthetic retry OCR' where id=$1", [old.id]);
  assert.equal((await fetch(`${baseUrl}/api/guest/documents/${old.id}/retry-processing`, { method: "POST", headers: cookie })).status, 200);
  assert.equal(new Date((await query("select expires_at from guest_documents where id=$1", [old.id])).rows[0].expires_at).getTime(), new Date(old.expires_at).getTime());
  await query("update guest_documents set expires_at=now() where id=$1", [old.id]);
  assert.equal((await fetch(`${baseUrl}/api/guest/documents/${old.id}/file`, { headers: cookie })).status, 404);
  const state = await (await fetch(`${baseUrl}/api/guest/document`, { headers: cookie })).json();
  assert.ok(state.documents.every((row) => row.id !== String(old.id)));
  const body = new FormData(); body.set("photo", new Blob(["synthetic user image"], { type: "image/jpeg" }), "test.jpg");
  const userUpload = await fetch(`${baseUrl}/api/upload`, { method: "POST", body });
  assert.equal(userUpload.status, 200);
  const uploaded = await userUpload.json(); files.add(path.join(userUploadsDir, uploaded.filename));
  const stored = (await query("select * from photos where filename=$1", [uploaded.filename])).rows[0];
  assert.equal(path.dirname(stored.storage_path), userUploadsDir);
  await new Promise((resolve) => appServer.close(resolve)); appServer = null;
});

test("dry-run preserves data; expired guest rows/files deleted; personal/fresh preserved; bounded batches", async () => {
  const expired = await document({ expired: true });
  const fresh = await document(); const personal = await photo();
  const dry = await cleanupGuests({ log: quiet }); assert.equal(dry.deleted, 0);
  const cli = execFileSync(process.execPath, ["scripts/cleanupGuests.js", "--dry-run"], { cwd: serverDir, env: process.env, encoding: "utf8" });
  assert.match(cli, /"dryRun":true/);
  assert.doesNotMatch(cli, /dotenv|synthetic OCR|example\.test/);
  assert.equal((await query("select count(*)::int as n from guest_documents")).rows[0].n, 2);
  assert.equal(await fs.readFile(expired.storage_path, "utf8"), "synthetic image");
  const apply = await cleanupGuests({ dryRun: false, batchSize: 1, log: quiet }); assert.equal(apply.deleted, 1);
  await assert.rejects(fs.stat(expired.storage_path), { code: "ENOENT" });
  await fs.stat(fresh.storage_path); await fs.stat(personal.storage_path);
  assert.equal((await query("select count(*)::int as n from guest_sessions")).rows[0].n, 1);
});

test("claim preserves every content column, removes source/text, metadata keeps count and improvement links", async () => {
  const guest = await document();
  const claimed = await claimGuestDocumentForUser(request()); assert.equal(claimed.length, 1);
const stored = (await query("select * from photos where id=$1", [claimed[0].id])).rows[0];
  assert.equal(stored.filename, guest.filename, "client pending-result handoff must match the original filename");
  assert.equal(path.basename(stored.storage_path), `claimed-${guest.id}-${guest.filename}`);
  for (const key of ["ocr_text", "clean_text", "title", "summary", "category", "section", "topic", "tags", "formatted_content", "formatted_at", "corrections", "has_table", "has_formulas", "has_recognition_errors", "ai_notes", "text_quality", "processed_at", "created_at"]) assert.deepEqual(stored[key], guest[key], key);
  assert.equal(path.dirname(stored.storage_path), userUploadsDir);
  assert.equal((await query("select * from guest_documents where id=$1", [guest.id])).rows.length, 0);
  await assert.rejects(fs.stat(guest.storage_path), { code: "ENOENT" });
  assert.equal((await findUserForAdmin(user.id)).documents_transferred_from_guest, 1);
  await query("insert into recognition_improvement_requests (user_id, photo_id, manual_review_consent_at) values ($1,$2,now())", [user.id, stored.id]);
  const { findLatestGuestDocumentBySessionId } = await import("../repositories/guestDocumentsRepository.js");
  const visible = await findLatestGuestDocumentBySessionId(session.id);
  assert.equal(visible.improvement_request_status, "submitted"); assert.equal(visible.ocr_text, guest.ocr_text);
  await query("update guest_document_claims set expires_at=now() - interval '1 hour'");
  await cleanupGuests({ dryRun: false, log: quiet }); await fs.stat(stored.storage_path);
  assert.equal((await findUserForAdmin(user.id)).documents_transferred_from_guest, 1);
});

test("simultaneous and repeated login produces exactly one archive document", async () => {
  await document();
  await Promise.all([claimGuestDocumentForUser(request()), claimGuestDocumentForUser(request())]);
  assert.equal((await claimGuestDocumentForUser(request())).length, 0);
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 1);
  assert.equal((await query("select documents_created_total from users where id=$1", [user.id])).rows[0].documents_created_total, 1);
  const other = (await query("insert into users (display_name) values ('Other synthetic') returning id")).rows[0];
  assert.equal(await claimGuestDocumentForUser({ ...request(), user: other }), null);
});

test("copy and commit failure retain original; retry does not duplicate", async () => {
  const guest = await document();
  await assert.rejects(transferGuestDocument(guest.id, user.id, { copy: ioError }), { code: "EACCES" });
  await fs.stat(guest.storage_path);
  await assert.rejects(transferGuestDocument(guest.id, user.id, { transaction: (callback) => withTransaction(async (client) => { await callback(client); throw new Error("synthetic commit failure"); }) }), /synthetic commit failure/);
  files.add(path.join(userUploadsDir, `claimed-${guest.id}-${guest.filename}`));
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 0); await fs.stat(guest.storage_path);
  await claimGuestDocumentForUser(request());
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 1);
});

test("failed post-commit source removal is durable and retried by cleanup", async () => {
  const guest = await document(); const stored = await transferGuestDocument(guest.id, user.id);
  const claim = (await query("select * from guest_document_claims where guest_document_id=$1", [guest.id])).rows[0];
  await assert.rejects(finishClaimSourceRemoval(claim, { remove: ioError }), { code: "EACCES" });
  await fs.stat(stored.storage_path); await fs.stat(guest.storage_path);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).sourcesRemoved, 1);
  await assert.rejects(fs.stat(guest.storage_path), { code: "ENOENT" }); await fs.stat(stored.storage_path);
});

test("a real PostgreSQL deferred constraint failure at COMMIT is safely retryable", async () => {
  const guest = await document();
  files.add(path.join(userUploadsDir, `claimed-${guest.id}-${guest.filename}`));
  await query("create table synthetic_commit_guard (id bigint primary key)");
  await query("alter table photos add constraint synthetic_commit_failure foreign key (user_id) references synthetic_commit_guard(id) deferrable initially deferred");
  await assert.rejects(transferGuestDocument(guest.id, user.id), { code: "23503" });
  await assert.rejects(fs.stat(path.join(userUploadsDir, `claimed-${guest.id}-${guest.filename}`)), { code: "ENOENT" });
  await fs.stat(guest.storage_path);
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 0);
  assert.equal((await query("select count(*)::int as n from guest_document_claims")).rows[0].n, 0);
  assert.equal((await query("select id from guest_documents")).rows[0].id, guest.id);
  await query("alter table photos drop constraint synthetic_commit_failure");
  await query("drop table synthetic_commit_guard");
  await claimGuestDocumentForUser(request());
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 1);
});

test("active processing/session lock and competing cleanup are skipped; release recovers stale processing", async () => {
  const guest = await document({ expired: true, status: "processing" });
  const release = await acquireGuestStorageLock(session.id);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).busy, 1); await fs.stat(guest.storage_path);
  await release();
  const job = await acquireGuestStorageLock("maintenance", { maintenance: true });
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).busy, 1); await job();
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).deleted, 1);
});

test("broken process connection releases its lock, allowing stale-processing cleanup", async () => {
  const guest = await document({ expired: true, status: "processing" });
  const crashedConnection = new pg.Client({ connectionString: url.toString() });
  await crashedConnection.connect();
  await crashedConnection.query("select pg_advisory_lock(731240, hashtext($1))", [String(session.id)]);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).busy, 1);
  await crashedConnection.end();
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).deleted, 1);
  await assert.rejects(fs.stat(guest.storage_path), { code: "ENOENT" });
});

test("two actual cleanup runs and transfer across expiration cannot delete each other's data", async () => {
  const expired = await document({ expired: true });
  let signalCopy; let allowCopy;
  const started = new Promise((resolve) => { signalCopy = resolve; });
  const proceed = new Promise((resolve) => { allowCopy = resolve; });
  const cleanup = cleanupGuests({ dryRun: false, log: quiet, remove: async (file) => { signalCopy(); await proceed; await removeManagedFile(file); } });
  await started;
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).busy, 1);
  allowCopy(); assert.equal((await cleanup).deleted, 1);
  await assert.rejects(fs.stat(expired.storage_path), { code: "ENOENT" });
  const guest = await document();
  await query("update guest_documents set expires_at=now()+interval '150 milliseconds' where id=$1", [guest.id]);
  const release = await acquireGuestStorageLock(session.id);
  let resumeCopy; const suspendedCopy = new Promise((resolve) => { resumeCopy = resolve; });
  let signalStarted; const copying = new Promise((resolve) => { signalStarted = resolve; });
  const transfer = transferGuestDocument(guest.id, user.id, { copy: async (source, destination) => { signalStarted(); await suspendedCopy; await durableCopy(source, destination); } });
  await copying;
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).busy, 1);
  resumeCopy(); const stored = await transfer; await release();
  await cleanupGuests({ dryRun: false, log: quiet }); await fs.stat(stored.storage_path);
});

test("failed removal after replacement is journalled and retried without extending expiry", async () => {
  const old = await document({ status: "error" }); const replacement = await write();
  const { replaceGuestDocumentUpload } = await import("../repositories/guestDocumentsRepository.js");
  await replaceGuestDocumentUpload(old.id, { ...replacement, mimeType: "image/jpeg", sizeBytes: 15, expiresAt: new Date(Date.now()+9999999999) });
  const current = (await query("select * from guest_documents where id=$1", [old.id])).rows[0];
  assert.deepEqual(current.expires_at, old.expires_at);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet, remove: ioError })).errors, 1); await fs.stat(old.storage_path);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).sourcesRemoved, 1);
  await fs.stat(current.storage_path); await assert.rejects(fs.stat(old.storage_path), { code: "ENOENT" });
});

test("missing file and filesystem error do not stop batch; error retains row for retry", async () => {
  const denied = await document({ expired: true }); const missing = await document({ expired: true });
  await fs.unlink(missing.storage_path);
  const result = await cleanupGuests({ dryRun: false, batchSize: 1, log: quiet, remove: (file) => file === denied.storage_path ? ioError() : removeManagedFile(file) });
  assert.equal(result.errors, 1); assert.equal(result.deleted, 1);
  assert.equal((await query("select id from guest_documents")).rows[0].id, denied.id);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).deleted, 1);
});

test("unsafe traversal and symlink paths are preserved", async () => {
  const outside = await write(uploadsDir, "outside");
  await document({ expired: true, storagePath: path.join(guestUploadsDir, "..", outside.filename) });
  const link = path.join(guestUploadsDir, `${prefix}-link.jpg`); files.add(link);
  try { await fs.symlink(outside.storagePath, link); }
  catch (error) { if (error.code !== "EPERM") throw error; }
  if (await fs.lstat(link).catch(() => null)) await document({ expired: true, storagePath: link });
  const result = await cleanupGuests({ dryRun: false, log: quiet }); assert.equal(result.deleted, 0);
  await fs.stat(outside.storagePath);
  await assert.rejects(managedFile(path.join(guestUploadsDir, "nested", "bad.jpg")), { code: "UNSAFE_STORAGE_PATH" });
});

test("directory junction cannot take cleanup outside the guest directory", async () => {
  const root = await fs.mkdtemp(path.join(uploadsDir, `${prefix}-junction-`));
  const junction = path.join(root, "guests");
  try {
    await fs.symlink(userUploadsDir, junction, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(removeManagedFile(path.join(junction, "synthetic.jpg"), ["guests"], root), { code: "UNSAFE_STORAGE_DIRECTORY" });
  } finally {
    await fs.unlink(junction).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await fs.rmdir(root);
  }
});

test("legacy shared file transition, dry-run, interrupted copy, retired-source error, and repeat", async () => {
  const shared = await write(uploadsDir, "shared"); const personal = await photo(shared.storagePath);
  const guest = await document({ directory: uploadsDir, storagePath: shared.storagePath, expired: true });
  const originalDate = guest.created_at;
  await query("update guest_documents set expires_at=created_at + interval '24 hours'");
  const cli = execFileSync(process.execPath, ["scripts/transitionGuestStorage.js", "--dry-run"], { cwd: serverDir, env: process.env, encoding: "utf8" });
  assert.match(cli, /"planned":2/);
  assert.doesNotMatch(cli, /dotenv|synthetic OCR|example\.test/);
  assert.equal((await transitionGuestStorage({ log: quiet })).planned, 2); await fs.stat(shared.storagePath);
  const partial = await transitionGuestStorage({ dryRun: false, log: quiet, copy: (source, destination) => path.dirname(destination) === guestUploadsDir ? ioError() : durableCopy(source, destination) });
  assert.equal(partial.errors, 1); await fs.stat(shared.storagePath);
  const movedPhoto = (await query("select * from photos where id=$1", [personal.id])).rows[0];
  assert.equal(path.dirname(movedPhoto.storage_path), userUploadsDir);
  const failedRetirement = await transitionGuestStorage({ dryRun: false, log: quiet, remove: ioError });
  assert.equal(failedRetirement.errors, 1); await fs.stat(shared.storagePath);
  const movedGuest = (await query("select * from guest_documents where id=$1", [guest.id])).rows[0];
  assert.deepEqual(movedGuest.created_at, originalDate);
  assert.equal(movedGuest.expires_at.getTime() - originalDate.getTime(), 864000000);
  assert.equal((await transitionGuestStorage({ dryRun: false, log: quiet })).retired, 1);
  await assert.rejects(fs.stat(shared.storagePath), { code: "ENOENT" });
  assert.equal((await transitionGuestStorage({ dryRun: false, log: quiet })).changed, 0);
  await cleanupGuests({ dryRun: false, log: quiet }); await fs.stat(movedPhoto.storage_path);
});

test("legacy claimed text removed while archive, improvement request and transfer count survive", async () => {
  const shared = await write(uploadsDir, "old-claim"); const personal = await photo(shared.storagePath);
  const guest = await document({ storagePath: shared.storagePath, status: "claimed" });
  await query("update guest_documents set claimed_photo_id=$2, claimed_at=now() where id=$1", [guest.id, personal.id]);
  await query("insert into recognition_improvement_requests (user_id, photo_id, manual_review_consent_at) values ($1,$2,now())", [user.id, personal.id]);
  assert.equal((await transitionGuestStorage({ log: quiet })).errors, 0);
  assert.equal((await transitionGuestStorage({ dryRun: false, log: quiet })).errors, 0);
  assert.equal((await query("select * from guest_documents")).rows.length, 0);
  assert.equal((await query("select * from recognition_improvement_requests")).rows[0].photo_id, personal.id);
  assert.equal((await findUserForAdmin(user.id)).documents_transferred_from_guest, 1);
});

test("legacy claims whose archive was deleted are reported and preserved without blocking other documents", async () => {
  const expired = await document({ directory: uploadsDir, status: "claimed", expired: true });
  const recent = await document({ directory: uploadsDir, status: "claimed" });
  for (const guest of [expired, recent]) {
    const personal = await photo(guest.storage_path);
    await query("update guest_documents set claimed_photo_id=$2, claimed_at=now() where id=$1", [guest.id, personal.id]);
    await query("delete from photos where id=$1", [personal.id]);
  }
  // The old individual photo delete may also have removed the shared image.
  await fs.unlink(recent.storage_path);
  const other = await document({ directory: uploadsDir });
  const before = (await query("select * from guest_documents where id=any($1::bigint[]) order by id", [[expired.id, recent.id]])).rows;
  assert.ok(before.every(row => row.claimed_photo_id === null));
  const reports = [];
  const preview = await transitionGuestStorage({ log: line => reports.push(JSON.parse(line)) });
  assert.equal(preview.errors, 0);
  assert.equal(preview.orphanClaims, 2);
  assert.equal(preview.planned, 1);
  assert.equal(reports.filter(row => row.action === "unlinked-claim-manual-review").length, 2);
  assert.deepEqual((await query("select * from guest_documents where id=any($1::bigint[]) order by id", [[expired.id, recent.id]])).rows, before);

  const applied = await transitionGuestStorage({ dryRun: false, log: quiet });
  assert.equal(applied.errors, 0);
  assert.equal(applied.orphanClaims, 2);
  assert.equal(applied.changed, 1);
  assert.deepEqual((await query("select * from guest_documents where id=any($1::bigint[]) order by id", [[expired.id, recent.id]])).rows, before);
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 0);
  assert.equal((await query("select count(*)::int as n from guest_document_claims")).rows[0].n, 0);
  assert.equal(path.dirname((await query("select storage_path from guest_documents where id=$1", [other.id])).rows[0].storage_path), guestUploadsDir);
  await fs.stat(expired.storage_path);
  await cleanupGuests({ dryRun: false, log: quiet });
  await fs.stat(expired.storage_path);
  assert.equal((await query("select count(*)::int as n from guest_documents where id=any($1::bigint[])", [[expired.id, recent.id]])).rows[0].n, 2);
  const repeated = await transitionGuestStorage({ dryRun: false, log: quiet });
  assert.equal(repeated.errors, 0);
  assert.equal(repeated.planned, 0);
  assert.equal(repeated.orphanClaims, 2);
});

test("an unlinked legacy claim keeps its source even when another live archive used the same file", async () => {
  const guest = await document({ directory: uploadsDir, status: "claimed", expired: true });
  const deleted = await photo(guest.storage_path);
  await query("update guest_documents set claimed_photo_id=$2 where id=$1", [guest.id, deleted.id]);
  await query("delete from photos where id=$1", [deleted.id]);
  const live = await photo(guest.storage_path);
  const result = await transitionGuestStorage({ dryRun: false, log: quiet });
  assert.equal(result.errors, 0);
  assert.equal(result.orphanClaims, 1);
  await fs.stat(guest.storage_path);
  const archive = (await query("select * from photos where id=$1", [live.id])).rows[0];
  assert.equal(path.dirname(archive.storage_path), userUploadsDir);
  await fs.stat(archive.storage_path);
  assert.equal((await query("select * from guest_documents where id=$1", [guest.id])).rows[0].claimed_photo_id, null);
  const repeated = await transitionGuestStorage({ dryRun: false, log: quiet });
  assert.equal(repeated.errors, 0);
  assert.equal(repeated.planned, 0);
  await fs.stat(guest.storage_path);
});

test("backup tar preserves nested guest/user folders and restore permits expiry cleanup", async () => {
  const expired = await document({ expired: true }); const personal = await photo();
  const archive = path.join(serverDir, `${prefix}.tar.gz`); files.add(archive);
  // Same recursive tar shape used by backup-production.sh; only synthetic files.
  execFileSync("tar", ["-czf", archive, "-C", serverDir, `uploads/guests/${expired.filename}`, `uploads/users/${personal.filename}`]);
  const names = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  assert.match(names, /uploads\/guests\//); assert.match(names, /uploads\/users\//);
  await fs.unlink(expired.storage_path); await fs.unlink(personal.storage_path);
  execFileSync("tar", ["-xzf", archive, "-C", serverDir]);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).deleted, 1); await fs.stat(personal.storage_path);
});

async function waitFor(check) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Synthetic writer did not reach the expected phase");
}
function crashWriter(mode, ...args) {
  const child = fork(path.join(serverDir, "tests/fixtures/guestStorageCrash.js"), [mode, ...args.map(String)], {
    env: process.env, execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"]
  });
  let errors = "";
  child.stderr.on("data", (data) => { errors += data; });
  const message = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Crash fixture timeout")), 20000);
    child.once("message", (data) => { clearTimeout(timer); resolve(data); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(`Fixture exited early: ${errors}`)); });
  });
  const kill = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const done = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL"); await done;
  };
  return { message, kill };
}
function streamUpload(port) {
  const request = http.request({ host: "127.0.0.1", port, method: "POST", path: "/api/guest/upload", headers: {
    Cookie: requestCookie(), "content-type": "multipart/form-data; boundary=synthetic-crash", "content-length": "1000000"
  } });
  request.on("error", () => {});
  request.write('--synthetic-crash\r\nContent-Disposition: form-data; name="photo"; filename="synthetic.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
  request.write(Buffer.alloc(32768, 65));
  return request;
}
const requestCookie = () => `guest_session_token=${session.session_token}`;
async function guestHttp(run, identity = null) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.user = identity?.(req); req.isAuthenticated = () => Boolean(req.user); next();
  });
  app.use(guestRoutes);
  const server = await new Promise((resolve) => { const item = app.listen(0, "127.0.0.1", () => resolve(item)); });
  try { return await run(`http://127.0.0.1:${server.address().port}`, server.address().port); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test("HTTP upload commits intent before writing; refusal to journal opens no file", async () => {
  const before = new Set(await fs.readdir(guestUploadsDir));
  await query("alter table guest_file_intents add constraint synthetic_no_intent check (false) not valid");
  try {
    await guestHttp(async (base) => {
      const body = new FormData(); body.set("photo", new Blob(["synthetic"], { type: "image/jpeg" }), "synthetic.jpg");
      assert.equal((await fetch(`${base}/api/guest/upload`, { method: "POST", headers: { Cookie: requestCookie() }, body })).status, 500);
    });
    assert.deepEqual(new Set(await fs.readdir(guestUploadsDir)), before);
    assert.equal((await query("select count(*)::int as n from guest_documents")).rows[0].n, 0);
    const release = await acquireGuestStorageLock(session.id, { tryOnly: true }); assert.ok(release); await release();
  } finally { await query("alter table guest_file_intents drop constraint synthetic_no_intent"); }
});

test("real HTTP writer killed before document insertion leaves durable intent; expiry removes only its file", async () => {
  const fixture = crashWriter("http"); let upload;
  try {
    const { port } = await fixture.message; upload = streamUpload(port);
    const intent = await waitFor(async () => {
      const row = (await query("select * from guest_file_intents where kind='upload'")).rows[0];
      if (row && await fs.stat(row.destination_path).catch(() => null)) return row;
    });
    files.add(intent.destination_path);
    assert.equal(intent.expires_at.getTime() - intent.created_at.getTime(), 240 * 3600000);
    assert.equal((await query("select count(*)::int as n from guest_documents")).rows[0].n, 0);
    await query("update guest_file_intents set cancelled_at=now()");
    assert.ok((await cleanupGuests({ dryRun: false, log: quiet })).busy > 0);
    await query("update guest_file_intents set cancelled_at=null");
    await fixture.kill(); upload.destroy();
    assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).intentsFinished, 0);
    await fs.stat(intent.destination_path);
    await query("update guest_file_intents set expires_at = now() - interval '1 second'");
    const dry = await cleanupGuests({ log: quiet }); assert.equal(dry.intentFilesRemoved, 0); await fs.stat(intent.destination_path);
    assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).intentFilesRemoved, 1);
    await assert.rejects(fs.stat(intent.destination_path), { code: "ENOENT" });
    assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).intentsFinished, 0);
  } finally { upload?.destroy(); await fixture.kill(); }
});

test("disconnecting a live multipart writer closes its file, cancels intent and releases locks", async () => {
  await guestHttp(async (_base, port) => {
    const upload = streamUpload(port);
    const intent = await waitFor(async () => (await query("select * from guest_file_intents")).rows[0]);
    files.add(intent.destination_path); upload.destroy();
    await waitFor(async () => (await query("select cancelled_at from guest_file_intents where id=$1", [intent.id])).rows[0]?.cancelled_at);
    const release = await waitFor(() => acquireGuestStorageLock(session.id, { tryOnly: true })); await release();
    const result = await cleanupGuests({ dryRun: false, log: quiet }); assert.equal(result.errors, 0);
    await assert.rejects(fs.stat(intent.destination_path), { code: "ENOENT" });
    assert.equal((await query("select count(*)::int as n from guest_documents")).rows[0].n, 0);
  });
});

for (const mode of ["temporary", "prepared"]) {
  test(`hard kill during ${mode} copy preserves original deadline and expiry recovers registered artifacts`, async () => {
    const guest = await document(); const fixture = crashWriter(mode, guest.id, user.id, session.id);
    try {
      await fixture.message;
      const intent = (await query("select * from guest_file_intents")).rows[0];
      files.add(intent.destination_path); files.add(intent.temporary_path);
      assert.deepEqual(intent.expires_at, guest.expires_at);
      await fs.stat(mode === "temporary" ? intent.temporary_path : intent.destination_path);
      await query("update guest_file_intents set cancelled_at=now()");
      assert.ok((await cleanupGuests({ dryRun: false, log: quiet })).busy > 0);
      await query("update guest_file_intents set cancelled_at=null");
      await fixture.kill();
      assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 0);
      assert.equal((await query("select id from guest_documents")).rows[0].id, guest.id);
      assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).intentsFinished, 0);
      await query("update guest_documents set expires_at=now()-interval '1 second'");
      await query("update guest_file_intents set expires_at=now()-interval '1 second'");
      const result = await cleanupGuests({ dryRun: false, log: quiet, batchSize: 1 });
      assert.equal(result.errors, 0); assert.equal(result.deleted, 1); assert.equal(result.intentFilesRemoved, 1);
      for (const file of [guest.storage_path, intent.destination_path, intent.temporary_path]) await assert.rejects(fs.stat(file), { code: "ENOENT" });
    } finally { await fixture.kill(); }
  });
}

test("retry after hard kill reuses owned destination, creates one archive and expiry preserves the live photo", async () => {
  const guest = await document(); const fixture = crashWriter("prepared", guest.id, user.id, session.id);
  try { await fixture.message; await fixture.kill(); }
  finally { await fixture.kill(); }
  await rememberPaths();
  const claimed = await claimGuestDocumentForUser(request()); assert.equal(claimed.length, 1);
  assert.equal(claimed[0].filename, guest.filename);
  await query("update guest_file_intents set expires_at=now()-interval '1 second'");
  const cleanup = await cleanupGuests({ dryRun: false, log: quiet }); assert.equal(cleanup.errors, 0);
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 1);
  await fs.stat(claimed[0].storage_path);
  assert.equal((await query("select count(*)::int as n from guest_file_intents")).rows[0].n, 0);
});

test("copy journal refusal cannot leave destination/temp, and foreign or unregistered destination is preserved", async () => {
  const guest = await document(); const destination = path.join(userUploadsDir, `claimed-${guest.id}-${guest.filename}`); files.add(destination);
  await query("alter table guest_file_intents add constraint synthetic_no_intent check (false) not valid");
  try { await assert.rejects(transferGuestDocument(guest.id, user.id), { code: "23514" }); }
  finally { await query("alter table guest_file_intents drop constraint synthetic_no_intent"); }
  await assert.rejects(fs.stat(destination), { code: "ENOENT" });
  assert.equal((await query("select count(*)::int as n from guest_file_intents")).rows[0].n, 0);
  await fs.writeFile(destination, "foreign unregistered file");
  await assert.rejects(transferGuestDocument(guest.id, user.id), { code: "UNOWNED_COPY_DESTINATION" });
  assert.equal(await fs.readFile(destination, "utf8"), "foreign unregistered file");
  const personal = await photo(destination);
  await assert.rejects(transferGuestDocument(guest.id, user.id), { code: "REFERENCED_COPY_DESTINATION" });
  await cleanupGuests({ dryRun: false, log: quiet });
  assert.equal(await fs.readFile(personal.storage_path, "utf8"), "foreign unregistered file");
});

test("rejected copy never removes an earlier owned copy now protected by another writer's journal", async () => {
  const guest = await document(); const destination = path.join(userUploadsDir, `claimed-${guest.id}-${guest.filename}`); files.add(destination);
  await durableCopy(guest.storage_path, destination, undefined, { userId: user.id,
    guestSessionId: session.id, guestDocumentId: guest.id, expiresAt: guest.expires_at });
  const other = (await query("insert into users (display_name) values ('Other writer') returning id")).rows[0];
  const protecting = await beginFileIntent({ kind: "copy", userId: other.id, destinationPath: destination, expiresAt: guest.expires_at });
  await protecting.release();
  await assert.rejects(transferGuestDocument(guest.id, user.id), { code: "REFERENCED_COPY_DESTINATION" });
  assert.equal(await fs.readFile(destination, "utf8"), "synthetic image");
});

test("intent cleanup survives deleted session, retries IO errors, handles missing file and never sweeps old users files", async () => {
  const registered = await write(); const unregistered = await write(userUploadsDir, "unregistered-old");
  await fs.utimes(unregistered.storagePath, new Date(0), new Date(0));
  const intent = await beginFileIntent({ kind: "upload", guestSessionId: session.id, destinationPath: registered.storagePath,
    createdAt: new Date(0), expiresAt: new Date(240 * 3600000) });
  await intent.release(); await query("delete from guest_sessions where id=$1", [session.id]);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet, remove: ioError })).errors, 1);
  assert.equal((await query("select id from guest_file_intents")).rows[0].id, intent.id);
  await fs.unlink(registered.storagePath);
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).intentsFinished, 1);
  assert.equal(await fs.readFile(unregistered.storagePath, "utf8"), "synthetic image");
});

test("cancelled intent retains a file referenced by another owner's archive; unsafe journal remains for review", async () => {
  const personal = await photo();
  const intent = await beginFileIntent({ kind: "copy", userId: user.id, guestSessionId: session.id,
    destinationPath: personal.storage_path, expiresAt: new Date(Date.now()+9999999) });
  await cancelFileIntent(intent.id); await intent.release();
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).intentsFinished, 1); await fs.stat(personal.storage_path);
  const outside = await write(uploadsDir, "unsafe-intent");
  const bad = await beginFileIntent({ kind: "upload", guestSessionId: session.id, destinationPath: outside.storagePath, expiresAt: new Date(0) });
  await bad.release();
  assert.equal((await cleanupGuests({ dryRun: false, log: quiet })).errors, 1); await fs.stat(outside.storagePath);
  assert.equal((await query("select id from guest_file_intents")).rows[0].id, bad.id);
});

const mockPipeline = { pipeline: "standard", ocrProvider: "synthetic", aiProvider: "synthetic" };
const aiResult = { title: "Enriched", summary: "synthetic summary", cleanText: "synthetic enriched text", tags: ["synthetic"],
  formattedContent: { blocks: [{ type: "paragraph", text: "synthetic enriched text" }] }, corrections: [], textQuality: "good" };
async function bareDocument() {
  const item = await document();
  await query("update guest_documents set title='',summary='',clean_text='',formatted_content='{}' where id=$1", [item.id]);
  return item;
}
const mockedClaim = (enrich, guard = () => null) => claimGuestDocumentForUser(request(), {
  enrich, guard, pipelineForUser: () => mockPipeline
});

test("conditional claim enrichment runs once for simultaneous logins, after transfer and outside a DB transaction", async () => {
  const guest = await bareDocument(); let calls = 0;
  const enrich = async (text, pipeline, options) => {
    calls++; assert.equal(text, guest.ocr_text); assert.deepEqual(pipeline, mockPipeline); assert.equal(options.trigger, "claim");
    assert.equal((await query("select count(*)::int as n from guest_documents")).rows[0].n, 0);
    const photo = (await query("select * from photos")).rows[0]; await fs.stat(photo.storage_path);
    // If transfer still held its transaction, this independent lock would time out.
    await withTransaction(async (client) => { await client.query("set local lock_timeout='100ms'"); await client.query("select id from photos for update"); });
    const exclusive = await acquireAccountOperationLock(user.id, { exclusive: true }); assert.equal(exclusive, null);
    return aiResult;
  };
  await Promise.all([mockedClaim(enrich), mockedClaim(enrich)]);
  assert.equal(calls, 1); assert.equal((await mockedClaim(enrich)).length, 0);
  const stored = (await query("select * from photos")).rows[0];
  assert.equal(stored.title, aiResult.title); assert.equal(stored.filename, guest.filename);
  assert.equal((await query("select enrichment_state from guest_document_claims")).rows[0].enrichment_state, "done");
});

test("claim guard skips existing enrichment, short text and disabled processing; pending bare claim resumes later without duplication", async () => {
  const complete = await document(); const short = await bareDocument(); const pending = await bareDocument();
  await query("update guest_documents set ocr_text='short' where id=$1", [short.id]);
  let calls = 0; const enrich = async () => { calls++; return aiResult; };
  await mockedClaim(enrich, () => "PROCESSING_DISABLED"); assert.equal(calls, 0);
  const state = await query("select guest_document_id,enrichment_state from guest_document_claims order by guest_document_id");
  assert.equal(state.rows.find((row) => row.guest_document_id === complete.id).enrichment_state, "done");
  assert.equal(state.rows.find((row) => row.guest_document_id === short.id).enrichment_state, "done");
  assert.equal(state.rows.find((row) => row.guest_document_id === pending.id).enrichment_state, "pending");
  await mockedClaim(enrich); assert.equal(calls, 1);
  assert.equal((await query("select count(*)::int as n from photos")).rows[0].n, 3);
});

test("a committed claim pending enrichment recovers on next login; AI failure preserves OCR and is not called repeatedly", async () => {
  const guest = await bareDocument(); await transferGuestDocument(guest.id, user.id);
  let calls = 0;
  await mockedClaim(async () => { calls++; throw new Error("synthetic AI failure"); });
  await mockedClaim(async () => { calls++; return aiResult; }); assert.equal(calls, 1);
  const stored = (await query("select * from photos")).rows[0];
  assert.equal(stored.ocr_text, guest.ocr_text); assert.equal(stored.status, "error"); await fs.stat(stored.storage_path);
  assert.equal((await query("select enrichment_state from guest_document_claims")).rows[0].enrichment_state, "failed");
});

test("newer user result wins over late claim AI and deletion remains blocked through the network call", async () => {
  await bareDocument();
  const protectedUser = (await query("insert into users (display_name) values ('Protected synthetic') returning id")).rows[0];
  const protection = { valid: true, ids: [protectedUser.id] };
  await mockedClaim(async () => {
    await assert.rejects(deleteAccount(user.id, String(user.id), null, { protection }), { code: "ACCOUNT_BUSY" });
    await query("update photos set title='new user result',updated_at=now()"); return aiResult;
  });
  assert.equal((await query("select title from photos")).rows[0].title, "new user result");
});

test("claimed HTTP handoff permits only authenticated archive owner; old cookie after logout/other login cannot read or correct", async () => {
  const guest = await document();
  await query(`update guest_documents set corrections='[{"id":"test-correction","original":"synthetic","replacement":"corrected","blockIndex":0,"itemIndex":null,"start":0,"end":9,"applied":false}]' where id=$1`, [guest.id]);
  const [stored] = await claimGuestDocumentForUser(request());
  const other = (await query("insert into users (display_name) values ('Other synthetic') returning id")).rows[0];
  await guestHttp(async (base) => {
    for (const identity of ["anonymous", "other", "owner"]) {
      const headers = { Cookie: requestCookie(), "x-synthetic-identity": identity, "content-type": "application/json" };
      const owner = identity === "owner";
      const stateResponse = await fetch(`${base}/api/guest/document`, { headers });
      assert.equal(stateResponse.headers.get("cache-control"), "private, no-store");
      const state = await stateResponse.json();
      assert.equal(state.documents.length, owner ? 1 : 0);
      if (owner) assert.equal(state.document.filename, guest.filename);
      assert.equal((await fetch(`${base}/api/guest/documents/${guest.id}/file`, { headers })).status, owner ? 200 : 404);
      const correction = await fetch(`${base}/api/guest/documents/${guest.id}/corrections/test-correction`, {
        method: "PATCH", headers, body: JSON.stringify({ applied: true })
      });
      assert.equal(correction.status, owner ? 200 : 404);
      assert.equal((await query("select corrections from photos where id=$1", [stored.id])).rows[0].corrections[0].applied, owner);
      assert.equal((await fetch(`${base}/api/guest/documents/${guest.id}/retry-processing`, { method: "POST", headers })).status, owner ? 409 : 404);
    }
  }, (req) => req.get("x-synthetic-identity") === "owner" ? user : req.get("x-synthetic-identity") === "other" ? other : null);
});
