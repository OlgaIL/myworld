import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import express from "express";
import sessionMiddleware from "express-session";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname), "Deletion tests require local PostgreSQL");
const schema = `deletion_test_${crypto.randomUUID().replaceAll("-", "")}`;
const bootstrap = new pg.Pool({ connectionString: databaseUrl.toString() });
await bootstrap.query(`create schema ${schema}`);
databaseUrl.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = databaseUrl.toString();
process.env.ADMIN_ENABLED = "true";
process.env.ADMIN_LOGIN = "synthetic-admin";
process.env.ADMIN_PASSWORD = "synthetic-password";
process.env.ADMIN_PROTECTED_USER_IDS = "2147483000";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.SERVER_URL = "http://localhost:4000";
process.env.AUTH_PROVIDERS = "email";
process.env.PROCESSING_ENABLED = "false";
process.env.YANDEX_METRIKA_API_ENABLED = "false";
for (const key of ["OPENAI_API_KEY", "YANDEX_API_KEY", "TELEGRAM_BOT_TOKEN", "SMTP_PASSWORD", "YOOKASSA_SECRET_KEY"]) process.env[key] = "";
globalThis.__myworldEnvLoaded = true;

const { query, withTransaction, getPool, closeDatabaseConnection } = await import("../db/index.js");
const { uploadsDir, guestUploadsDir, userUploadsDir, ensurePrivateUploadDirectories } = await import("../config/paths.js");
const { deleteAccount, getAccountDeletionEligibility } = await import("../services/accountDeletionService.js");
const { cleanupAccountDeletion, getAccountDeletionJob, cleanupPendingAccountDeletions } = await import("../services/accountDeletionCleanupService.js");
const { acquireAccountOperationLock, withAccountOperation, closeAccountOperationLocks } = await import("../services/accountOperationLocks.js");
const { acquireGuestStorageLock, closeGuestStorageLocks } = await import("../services/guestStorageLocks.js");
const { beginFileIntent, closeFileIntentLocks } = await import("../repositories/guestFileIntentsRepository.js");
const { cleanupGuests } = await import("../services/guestCleanupService.js");
const { parseProtectedUserIds, protectionReason } = await import("../services/accountDeletionPolicy.js");
const { claimGuestDocumentForUser } = await import("../services/guestClaimService.js");
const { upsertGoogleUser, mapUserForSession } = await import("../repositories/usersRepository.js");
const passport = (await import("../auth/passport.js")).default;
const adminRoutes = (await import("../routes/adminRoutes.js")).default;
const photoRoutes = (await import("../routes/photoRoutes.js")).default;
const authRoutes = (await import("../routes/authRoutes.js")).default;
for (const name of (await fs.readdir(path.join(serverDir, "db/migrations"))).filter((name) => name.endsWith(".sql")).sort()) {
  await query(await fs.readFile(path.join(serverDir, "db/migrations", name), "utf8"));
}
ensurePrivateUploadDirectories();
const prefix = `deletion-test-${crypto.randomUUID()}`;
const files = new Set();
const quiet = () => {};
let user, other, adminCookie, appServer, baseUrl;
const app = express();
app.use(express.json());
app.use(sessionMiddleware({ secret: "synthetic-session", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.post("/test/user-login", async (req, res, next) => {
  const row = (await query("select * from users where id = $1", [req.body.id])).rows[0];
  req.logIn(mapUserForSession(row), (error) => error ? next(error) : res.json({ ok: true }));
});
app.use(adminRoutes);
app.use(photoRoutes);
app.use(authRoutes);
appServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
baseUrl = `http://127.0.0.1:${appServer.address().port}`;

async function createUser(label = crypto.randomUUID()) {
  return (await query("insert into users (email, display_name) values ($1, 'Synthetic deletion') returning *", [`${prefix}-${label}@example.test`])).rows[0];
}
async function write(directory = userUploadsDir) {
  const file = path.join(directory, `${prefix}-${crypto.randomUUID()}.jpg`);
  files.add(file); await fs.writeFile(file, "synthetic image"); return file;
}
async function photo(owner = user.id, storagePath = null, status = "processed") {
  const file = storagePath || await write();
  return (await query("insert into photos (user_id, filename, storage_path, status, ocr_text, clean_text) values ($1,$2,$3,$4,'synthetic OCR','synthetic text') returning *", [owner, path.basename(file), file, status])).rows[0];
}
async function guest(converted = user.id) {
  return (await query("insert into guest_sessions (session_token, converted_user_id) values ($1,$2) returning *", [crypto.randomUUID(), converted])).rows[0];
}
async function guestDocument(guestSession, storagePath = null, claimedPhotoId = null) {
  const file = storagePath || await write(guestUploadsDir);
  return (await query(`insert into guest_documents (guest_session_id, filename, storage_path, status, expires_at, claimed_photo_id, ocr_text)
    values ($1,$2,$3,$4,now() + interval '240 hours',$5,'synthetic guest text') returning *`,
  [guestSession.id, path.basename(file), file, claimedPhotoId ? "claimed" : "processed", claimedPhotoId])).rows[0];
}
async function payment(owner = user.id, status = "pending", client = { query }) {
  return (await client.query(`insert into payments (user_id, idempotence_key, package_id, package_title, package_amount, amount_value, status)
    values ($1,$2,'synthetic','Synthetic',5,10,$3) returning *`, [owner, crypto.randomUUID(), status])).rows[0];
}
async function request(url, { cookie = adminCookie, ...options } = {}) {
  return fetch(`${baseUrl}${url}`, { ...options, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...options.headers } });
}
async function csrf(id = user.id, cookie = adminCookie) {
  const response = await request(`/admin-api/users/${id}`, { cookie });
  assert.equal(response.status, 200);
  return (await response.json()).deletion.csrfToken;
}
async function apiDelete(id = user.id, { cookie = adminCookie, token, confirmationId = String(id), ...options } = {}) {
  token ??= await csrf(id, cookie);
  return request(`/admin-api/users/${id}`, { cookie, method: "DELETE", body: JSON.stringify({ confirmationId }),
    ...options, headers: { "x-admin-deletion-csrf": token, ...options.headers } });
}
async function exists(table, id) { return Boolean((await query(`select 1 from ${table} where id = $1`, [id])).rows.length); }
async function refusal(code, callback = () => deleteAccount(user.id, String(user.id))) {
  await assert.rejects(callback, (error) => error.code === code);
  assert.equal(await exists("users", user.id), true);
}

beforeEach(async () => {
  const tables = (await query("select tablename from pg_tables where schemaname = current_schema()")).rows;
  await query(`truncate ${tables.map((row) => row.tablename).join(",")} cascade`);
  await query("insert into users (id, display_name) values (2147483000,'Protected synthetic administrator')");
  user = await createUser(); other = await createUser();
  const response = await request("/admin-api/login", { cookie: null, method: "POST", body: JSON.stringify({ login: "synthetic-admin", password: "synthetic-password" }) });
  assert.equal(response.status, 200); adminCookie = response.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  await new Promise((resolve) => appServer.close(resolve));
  await closeAccountOperationLocks(); await closeGuestStorageLocks(); await closeFileIntentLocks(); await closeDatabaseConnection();
  await bootstrap.query(`drop schema ${schema} cascade`); await bootstrap.end();
  for (const file of files) await fs.unlink(file).catch((error) => { if (error.code !== "ENOENT") throw error; });
});

test("strict, fail-closed protected ID configuration, current and protected account", async () => {
  for (const value of [undefined, "", " ", "0", "1,", "-1", "1.5", "1e3", "01", "9223372036854775808", "a"]) assert.equal(parseProtectedUserIds(value).valid, false);
  assert.deepEqual(parseProtectedUserIds("1, 2,1"), { valid: true, ids: ["1", "2"] });
  assert.equal(protectionReason(user.id, user.id), "ACCOUNT_CURRENT_USER");
  await refusal("ACCOUNT_CURRENT_USER", () => deleteAccount(user.id, String(user.id), user.id));
  await assert.rejects(() => deleteAccount("2147483000", "2147483000"), { code: "ACCOUNT_PROTECTED" });
  for (const value of ["", "malformed", "999999999"]) await refusal("DELETION_PROTECTION_CONFIG", () => deleteAccount(user.id, String(user.id), null, { protection: parseProtectedUserIds(value) }));
});

test("real admin API deletes synthetic account and linked data/files; registration starts anew", async () => {
  await query("update users set google_id = $2 where id = $1", [user.id, prefix]);
  const p = await photo();
  const s = await guest();
  const d = await guestDocument(s, null, p.id);
  const source = await write(guestUploadsDir);
  const retired = await write(guestUploadsDir);
  await query("insert into guest_storage_retirements (storage_path, guest_session_id) values ($1,$2)", [retired, s.id]);
  await query(`insert into guest_document_claims (guest_document_id, guest_session_id, photo_id, user_id, expires_at, source_path)
    values (999999,$1,$2,$3,now() + interval '1 day',$4)`, [s.id, p.id, user.id, source]);
  await query("insert into access_requests (user_id, email, message) values ($1,$2,'synthetic request')", [user.id, user.email]);
  await query("insert into processing_credit_events (user_id, source, package_title, amount) values ($1,'manual','Synthetic',5)", [user.id]);
  await query("insert into recognition_improvement_requests (user_id, photo_id, manual_review_consent_at) values ($1,$2,now())", [user.id, p.id]);
  await query("insert into email_login_codes (email_normalized, code_hash, request_ip_hash, expires_at) values ($1,'synthetic','synthetic',now()+interval '10 minutes')", [user.email]);
  const response = await apiDelete();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cleanupPending, false);
  for (const table of ["users", "photos", "access_requests", "processing_credit_events", "recognition_improvement_requests", "guest_document_claims", "guest_sessions", "guest_documents", "guest_storage_retirements", "email_login_codes", "notification_outbox"]) {
    const count = (await query(`select count(*)::int as count from ${table}`)).rows[0].count;
    if (table === "users") assert.equal(count, 2);
    else if (table === "notification_outbox") assert.equal(count, 2);
    else assert.equal(count, 0, table);
  }
  for (const file of [p.storage_path, d.storage_path, source, retired]) await assert.rejects(fs.stat(file), { code: "ENOENT" });
  const registered = await upsertGoogleUser({ googleId: prefix, email: user.email, displayName: "Synthetic again" });
  assert.notEqual(registered.id, user.id);
  assert.equal(registered.records_processed_total, 0);
  assert.equal(registered.processing_quota, 0);
  assert.equal(registered.processing_used, 0);
  assert.equal(registered.documents_created_total, 0);
});

test("every payment status protects direct API and DB deletion, preserving files", async () => {
  const p = await photo();
  for (const status of ["pending", "waiting_for_capture", "succeeded", "canceled", "failed"]) {
    const pay = await payment(user.id, status);
    const eligibility = await getAccountDeletionEligibility(user.id);
    assert.equal(eligibility.reason, "ACCOUNT_HAS_PAYMENTS");
    const response = await apiDelete(); assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "ACCOUNT_HAS_PAYMENTS");
    await assert.rejects(query("delete from users where id = $1", [user.id]), { code: "23001" });
    assert.equal(await exists("payments", pay.id), true); assert.equal(await fs.readFile(p.storage_path, "utf8"), "synthetic image");
    await query("delete from payments where id = $1", [pay.id]);
  }
});

test("paid credit with missing payment history and credit with payment_id both protect deletion", async () => {
  await photo();
  const credit = (await query("insert into processing_credit_events (user_id, source, package_title, amount) values ($1,'yookassa','Synthetic',5) returning id", [user.id])).rows[0];
  await refusal("ACCOUNT_PAID_CREDITS");
  assert.equal((await apiDelete()).status, 409);
  await assert.rejects(query("delete from users where id = $1", [user.id]), { code: "P0001" });
  await query("delete from processing_credit_events where id = $1", [credit.id]);
  const pay = await payment(other.id);
  await query("insert into processing_credit_events (user_id, source, payment_id, package_title, amount) values ($1,'manual',$2,'Synthetic',5)", [user.id, pay.id]);
  await refusal("ACCOUNT_PAID_CREDITS");
});

test("guest/ordinary sessions and cross-site, absent or incorrect CSRF tokens cannot delete", async () => {
  await photo();
  const ordinary = await request("/test/user-login", { cookie: null, method: "POST", body: JSON.stringify({ id: user.id }) });
  const ordinaryCookie = ordinary.headers.get("set-cookie").split(";")[0];
  for (const cookie of [null, ordinaryCookie]) assert.equal((await request(`/admin-api/users/${user.id}`, { cookie, method: "DELETE", body: JSON.stringify({ confirmationId: String(user.id) }) })).status, 401);
  const token = await csrf();
  for (const headers of [{}, { "x-admin-deletion-csrf": "incorrect" }, { "x-admin-deletion-csrf": token, origin: "https://evil.example" }, { "x-admin-deletion-csrf": token, "sec-fetch-site": "cross-site" }]) {
    assert.equal((await request(`/admin-api/users/${user.id}`, { method: "DELETE", headers, body: JSON.stringify({ confirmationId: String(user.id) }) })).status, 403);
  }
  const adminLogin = await request("/admin-api/login", { cookie: ordinaryCookie, method: "POST", body: JSON.stringify({ login: "synthetic-admin", password: "synthetic-password" }) });
  assert.equal(adminLogin.status, 200);
  const response = await apiDelete(user.id, { cookie: ordinaryCookie });
  assert.equal(response.status, 409); assert.equal((await response.json()).error, "ACCOUNT_CURRENT_USER");
});

test("cancel/read-only preview, wrong confirmation, invalid/unknown and repeated requests", async () => {
  const p = await photo();
  await csrf(); // Opening/canceling confirmation makes no mutation.
  assert.equal(await exists("users", user.id), true); assert.ok(await fs.stat(p.storage_path));
  for (const confirmationId of ["", "wrong", Number(user.id), ` ${user.id}`]) assert.equal((await apiDelete(user.id, { confirmationId })).status, 400);
  const token = await csrf();
  assert.equal((await apiDelete("invalid", { token })).status, 400);
  assert.equal((await apiDelete("99999999", { token })).status, 404);
  assert.equal((await apiDelete(user.id, { token })).status, 200);
  assert.equal((await apiDelete(user.id, { token })).status, 404);
});

test("real PostgreSQL COMMIT failure rolls account/queue back and leaves every file", async () => {
  const p = await photo();
  await query("create table synthetic_commit_guard (id bigint references users(id) deferrable initially deferred)");
  try {
    await assert.rejects(() => deleteAccount(user.id, String(user.id), null, { transaction: (callback) => withTransaction(async (client) => {
      const result = await callback(client);
      await client.query("insert into synthetic_commit_guard (id) values ($1)", [user.id]);
      return result;
    }) }), { code: "23503" });
    assert.equal(await exists("users", user.id), true); assert.ok(await fs.stat(p.storage_path));
    assert.equal((await query("select count(*)::int as count from account_deletion_jobs")).rows[0].count, 0);
  } finally { await query("drop table synthetic_commit_guard"); }
});

test("file error is durable/retryable; dry-run, absent files and common files are safe", async () => {
  const legacy = await photo(user.id, await write(uploadsDir));
  const shared = await photo(); await photo(other.id, shared.storage_path);
  const s = await guest(other.id); await guestDocument(s, shared.storage_path);
  const missing = await photo(); await fs.unlink(missing.storage_path);
  const { jobId } = await deleteAccount(user.id, String(user.id));
  await cleanupPendingAccountDeletions({ dryRun: true, log: quiet });
  assert.ok(await fs.stat(legacy.storage_path));
  const failed = await cleanupAccountDeletion(jobId, { remove: async () => { throw Object.assign(new Error("synthetic"), { code: "EACCES" }); }, log: quiet });
  assert.equal(failed.cleanupPending, true); assert.equal(failed.hasErrors, true);
  assert.ok(await fs.stat(legacy.storage_path)); assert.ok(await fs.stat(shared.storage_path));
  const complete = await cleanupAccountDeletion(jobId, { log: quiet });
  assert.equal(complete.cleanupPending, false); assert.equal(complete.preservedFiles, 1);
  await assert.rejects(fs.stat(legacy.storage_path), { code: "ENOENT" }); assert.ok(await fs.stat(shared.storage_path));
  assert.deepEqual(await cleanupAccountDeletion(jobId, { log: quiet }), await getAccountDeletionJob(jobId));
});

test("paths outside uploads and symlinks refuse deletion without touching files", async () => {
  const outside = path.join(serverDir, `${prefix}-outside.jpg`); files.add(outside); await fs.writeFile(outside, "outside");
  const p = await photo(user.id, outside);
  await refusal("ACCOUNT_UNSAFE_FILES"); assert.equal(await fs.readFile(outside, "utf8"), "outside");
  const link = path.join(uploadsDir, `${prefix}-junction`);
  try {
    await fs.symlink(serverDir, link, "junction");
    await query("update photos set storage_path = $2 where id = $1", [p.id, path.join(link, path.basename(outside))]);
    await refusal("ACCOUNT_UNSAFE_FILES"); assert.equal(await fs.readFile(outside, "utf8"), "outside");
  } finally { await fs.rmdir(link); }
});

test("active processing, improvement review, user and guest locks block deletion", async () => {
  const p = await photo(user.id, null, "processing");
  await refusal("ACCOUNT_BUSY");
  await query("update photos set status='processed' where id=$1", [p.id]);
  const review = (await query("insert into recognition_improvement_requests (user_id, photo_id, status, manual_review_consent_at) values ($1,$2,'in_review',now()) returning id", [user.id, p.id])).rows[0];
  await refusal("ACCOUNT_BUSY"); await query("delete from recognition_improvement_requests where id=$1", [review.id]);
  const releaseUser = await acquireAccountOperationLock(user.id);
  try { await refusal("ACCOUNT_BUSY"); } finally { await releaseUser(); }
  const s = await guest(); const releaseGuest = await acquireGuestStorageLock(s.id);
  try { await refusal("ACCOUNT_BUSY"); } finally { await releaseGuest(); }
  const releaseMaintenance = await acquireGuestStorageLock("maintenance", { maintenance: true });
  try { await refusal("ACCOUNT_BUSY"); } finally { await releaseMaintenance(); }
});

test("both concurrent payment orders preserve any committed payment", async () => {
  const p = await photo();
  const paying = await getPool().connect();
  await paying.query("begin"); const pay = await payment(user.id, "pending", paying);
  const deleting = deleteAccount(user.id, String(user.id));
  await paying.query("commit"); paying.release();
  await assert.rejects(deleting, { code: "ACCOUNT_HAS_PAYMENTS" });
  assert.equal(await exists("payments", pay.id), true); assert.ok(await fs.stat(p.storage_path));
  await query("delete from payments where id = $1", [pay.id]);
  let startPayment;
  const blockedPayment = new Promise((resolve) => { startPayment = resolve; });
  let insertion;
  const result = await deleteAccount(user.id, String(user.id), null, { transaction: (callback) => withTransaction(async (client) => {
    const result = await callback(client);
    insertion = payment().then(() => ({ success: true }), (error) => ({ code: error.code }));
    startPayment();
    return result;
  }) });
  await blockedPayment;
  assert.equal((await insertion).code, "23503");
  assert.equal(await exists("users", user.id), false); await cleanupAccountDeletion(result.jobId, { log: quiet });
});

test("concurrent paid credit creation cannot be cascaded away", async () => {
  const client = await getPool().connect(); await client.query("begin");
  await client.query("insert into processing_credit_events (user_id, source, package_title, amount) values ($1,'yookassa','Synthetic',5)", [user.id]);
  const deleting = deleteAccount(user.id, String(user.id));
  await client.query("commit"); client.release();
  await assert.rejects(deleting, { code: "ACCOUNT_PAID_CREDITS" });
  assert.equal((await query("select count(*)::int as count from processing_credit_events where user_id=$1", [user.id])).rows[0].count, 1);
});

test("old real Passport session loses access and old guest cookie cannot restore documents", async () => {
  const p = await photo(); const s = await guest(); await guestDocument(s);
  const login = await request("/test/user-login", { cookie: null, method: "POST", body: JSON.stringify({ id: user.id }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/photos", { cookie })).status, 200);
  const result = await deleteAccount(user.id, String(user.id)); await cleanupAccountDeletion(result.jobId, { log: quiet });
  assert.equal((await request("/api/photos", { cookie })).status, 401);
  const registered = await createUser("re-registered");
  assert.equal(await claimGuestDocumentForUser({ user: { id: registered.id }, headers: { cookie: `guest_session_token=${s.session_token}` } }), null);
  assert.equal((await query("select count(*)::int as count from photos where user_id=$1", [registered.id])).rows[0].count, 0);
  await assert.rejects(fs.stat(p.storage_path), { code: "ENOENT" });
});

test("operation wrapper retains processing lock until completion even after socket closes", async () => {
  let finish; const held = new Promise((resolve) => { finish = resolve; });
  let started; const ready = new Promise((resolve) => { started = resolve; });
  const handler = withAccountOperation(async () => { started(); await held; });
  const work = handler({ user: { id: user.id } }, {}, (error) => { throw error; });
  await ready;
  try { await refusal("ACCOUNT_BUSY"); } finally { finish(); await work; }
  const result = await deleteAccount(user.id, String(user.id)); assert.ok(result.deleted);
});

test("foreign claim or improvement relationships refuse deletion; shared email codes remain", async () => {
  const p = await photo(); const s = await guest(other.id);
  await query(`insert into guest_document_claims (guest_document_id, guest_session_id, photo_id, user_id, expires_at)
    values (99999,$1,$2,$3,now()+interval '1 day')`, [s.id, p.id, other.id]);
  await refusal("ACCOUNT_SHARED_DATA"); await query("delete from guest_document_claims");
  await query("update users set email=$2 where id=$1", [other.id, user.email]);
  await query("insert into email_login_codes (email_normalized, code_hash, request_ip_hash, expires_at) values ($1,'synthetic','synthetic',now()+interval '1 day')", [user.email]);
  const result = await deleteAccount(user.id, String(user.id)); await cleanupAccountDeletion(result.jobId, { log: quiet });
  assert.equal((await query("select count(*)::int as count from email_login_codes")).rows[0].count, 1);
});

test("aborted guest transfer prepared copy and temp are removed only with proven session ownership", async () => {
  const s = await guest(); const d = await guestDocument(s);
  const expected = path.join(userUploadsDir, `claimed-${d.id}-${path.basename(d.filename)}`);
  const temporary = `${expected}.${crypto.randomUUID()}.tmp`;
  const unrelated = await write();
  for (const file of [expected, temporary]) { files.add(file); await fs.writeFile(file, "synthetic prepared copy"); }
  const result = await deleteAccount(user.id, String(user.id));
  await cleanupAccountDeletion(result.jobId, { log: quiet });
  for (const file of [d.storage_path, expected, temporary]) await assert.rejects(fs.stat(file), { code: "ENOENT" });
  assert.ok(await fs.stat(unrelated));
});

test("two concurrent deletions are safe and pending cleanup can be queried/retried via admin API", async () => {
  const p = await photo();
  const token = await csrf();
  const results = await Promise.allSettled([deleteAccount(user.id, String(user.id)), deleteAccount(user.id, String(user.id))]);
  const successful = results.filter((r) => r.status === "fulfilled");
  assert.equal(successful.length, 1);
  assert.ok(["ACCOUNT_BUSY", "USER_NOT_FOUND"].includes(results.find((r) => r.status === "rejected").reason.code));
  const jobId = successful[0].value.jobId;
  assert.equal((await request(`/admin-api/account-deletions/${jobId}`, { cookie: null })).status, 401);
  const status = await request(`/admin-api/account-deletions/${jobId}`);
  assert.equal(status.status, 200); assert.equal((await status.json()).cleanupPending, true);
  assert.equal((await request(`/admin-api/account-deletions/${jobId}/retry`, { method: "POST", body: "{}" })).status, 403);
  const retry = await request(`/admin-api/account-deletions/${jobId}/retry`, { method: "POST", body: "{}", headers: { "x-admin-deletion-csrf": token } });
  assert.equal(retry.status, 200); assert.equal((await retry.json()).cleanupPending, false);
  await assert.rejects(fs.stat(p.storage_path), { code: "ENOENT" });
});

test("deletion journals exact unfinished upload/copy paths and blocks an active intent writer", async () => {
  const s = await guest(); const upload = await write(guestUploadsDir); const destination = await write();
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`; files.add(temporary); await fs.writeFile(temporary, "synthetic partial");
  const intent = await beginFileIntent({ kind: "copy", userId: user.id, guestSessionId: s.id,
    destinationPath: destination, temporaryPath: temporary, expiresAt: new Date(Date.now()+864000000) });
  try { await refusal("ACCOUNT_BUSY"); } finally { await intent.release(); }
  const pendingUpload = await beginFileIntent({ kind: "upload", guestSessionId: s.id,
    destinationPath: upload, expiresAt: new Date(Date.now()+864000000) }); await pendingUpload.release();
  const result = await deleteAccount(user.id, String(user.id));
  assert.equal((await query("select count(*)::int as n from guest_file_intents")).rows[0].n, 0);
  const queued = (await query("select storage_path from account_deletion_files where job_id=$1", [result.jobId])).rows.map((row) => row.storage_path);
  for (const file of [upload, destination, temporary]) { assert.ok(queued.includes(file)); await fs.stat(file); }
  await cleanupAccountDeletion(result.jobId, { log: quiet });
  for (const file of [upload, destination, temporary]) await assert.rejects(fs.stat(file), { code: "ENOENT" });
});

test("deletion cleanup preserves another user's registered file until its reference disappears", async () => {
  const p = await photo(); const result = await deleteAccount(user.id, String(user.id));
  const intent = await beginFileIntent({ kind: "copy", userId: other.id, destinationPath: p.storage_path, expiresAt: new Date(0) });
  await intent.release();
  await cleanupAccountDeletion(result.jobId, { log: quiet }); await fs.stat(p.storage_path);
  const status = await getAccountDeletionJob(result.jobId); assert.equal(status.preservedFiles, 1);
  assert.equal(status.cleanupPending, false); // The other owner's ledger now owns recovery.
  await cleanupGuests({ dryRun: false, log: quiet }); await assert.rejects(fs.stat(p.storage_path), { code: "ENOENT" });
});
