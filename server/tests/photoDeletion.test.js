import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import express from "express";

dotenv.config({ path: new URL("../.env", import.meta.url), quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Requires disposable LOCAL database schema");
const schema = `photo_delete_test_${crypto.randomBytes(10).toString("hex")}`;
const root = await fs.mkdtemp(path.join(os.tmpdir(), "myworld-photo-delete-"));
process.env.NODE_ENV = "test";
process.env.MYWORLD_TEST_UPLOADS_DIR = root;
process.env.PROCESSING_ENABLED = "false";
for (const key of ["OPENAI_API_KEY", "YANDEX_API_KEY", "TELEGRAM_BOT_TOKEN", "SMTP_PASSWORD"]) process.env[key] = "";
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
await admin.query(`create schema ${schema}`);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.href;
globalThis.__myworldEnvLoaded = true;

const { query, withTransaction, closeDatabaseConnection } = await import("../db/index.js");
const { userUploadsDir, guestUploadsDir, ensurePrivateUploadDirectories } = await import("../config/paths.js");
const { deletePhotosForUser, validateDeletionNames } = await import("../services/photoDeletionService.js");
const { cleanupAccountDeletion, cleanupPendingAccountDeletions } = await import("../services/accountDeletionCleanupService.js");
const { acquireAccountOperationLock, closeAccountOperationLocks } = await import("../services/accountOperationLocks.js");
const photoRoutes = (await import("../routes/photoRoutes.js")).default;
for (const name of (await fs.readdir(new URL("../db/migrations/", import.meta.url))).filter(n => n.endsWith(".sql")).sort()) {
  await query(await fs.readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8"));
}
ensurePrivateUploadDirectories();
const app = express();
app.use(express.json());
app.use((req, res, next) => { if (req.headers["x-test-user"]) req.user = { id: req.headers["x-test-user"] }; next(); });
app.use(photoRoutes);
const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const owner = async () => (await query("insert into users(display_name,email) values('Synthetic',$1) returning *", [`${crypto.randomUUID()}@example.test`])).rows[0];
async function photo(user, { status = "processed", file = null } = {}) {
  file ||= path.join(userUploadsDir, `${crypto.randomUUID()}.jpg`);
  await fs.writeFile(file, "synthetic image");
  return (await query("insert into photos(user_id,filename,storage_path,status,clean_text) values($1,$2,$3,$4,'synthetic result') returning *",
    [user.id, path.basename(file), file, status])).rows[0];
}
async function batch(user, names, extra = {}) {
  return fetch(`${base}/api/photos/delete-batch`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { "x-test-user": user.id } : {}) },
    body: JSON.stringify({ ...(names ? { names } : {}), ...extra }) });
}
const exists = async file => fs.stat(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; });
const rowExists = async id => Boolean((await query("select id from photos where id=$1", [id])).rowCount);

test("archive deletion: explicit snapshots, ownership, durable cleanup and partial failures", async t => {
  try {
    await t.test("requires authentication and a bounded explicit filename list", async () => {
      const user = await owner(), doc = await photo(user);
      assert.equal((await batch(null, [doc.filename])).status, 401);
      assert.equal((await fetch(`${base}/api/photos/${doc.filename}`, { method: "DELETE" })).status, 401);
      for (const names of [[], ["../outside.jpg"], ["a/b"], [null], Array(101).fill(doc.filename)]) {
        assert.equal((await batch(user, names)).status, 400);
      }
      assert.equal((await batch(user, null, { all: true })).status, 400);
      assert.deepEqual(validateDeletionNames([doc.filename, doc.filename]), [doc.filename]);
      assert.ok(await rowExists(doc.id));
    });

    await t.test("foreign documents stay private; paid balance, credits and payments survive", async () => {
      const user = await owner(), foreign = await owner();
      const mine = await photo(user), theirs = await photo(foreign);
      await query("update users set records_processed_total=59 where id=$1", [user.id]);
      const payment = (await query(`insert into payments(user_id,idempotence_key,package_id,package_title,package_amount,amount_value,status)
        values($1,$2,'synthetic','Synthetic',200,10,'pending') returning id`, [user.id, crypto.randomUUID()])).rows[0];
      const credit = (await query(`insert into processing_credit_events(user_id,payment_id,source,package_title,amount)
        values($1,$2,'yookassa','Synthetic',200) returning *`, [user.id, payment.id])).rows[0];
      const accountBefore = (await query("select * from users where id=$1", [user.id])).rows[0];
      const response = await batch(user, [mine.filename, theirs.filename, mine.filename]);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual(result.deleted, [mine.filename]);
      assert.deepEqual(result.missing, [theirs.filename]);
      assert.deepEqual(result.failed, []);
      assert.equal(result.cleanupPending, false);
      assert.equal(await exists(mine.storage_path), false);
      assert.ok(await exists(theirs.storage_path));
      assert.ok(await rowExists(theirs.id));
      const account = (await query("select * from users where id=$1", [user.id])).rows[0];
      assert.equal(account.records_processed_total, 59);
      for (const field of Object.keys(accountBefore).filter(key => !["documents_deleted_total", "updated_at"].includes(key))) {
        assert.deepEqual(account[field], accountBefore[field], `Account field ${field} must survive deletion`);
      }
      assert.deepEqual((await query("select * from processing_credit_events where id=$1", [credit.id])).rows[0], credit);
      assert.equal(account.documents_deleted_total, 1);
      assert.equal((await query("select id from payments where id=$1", [payment.id])).rowCount, 1);
    });

    await t.test("59 selected records delete once; a later upload is outside the snapshot", async () => {
      const user = await owner(), docs = [];
      for (let i = 0; i < 59; i++) docs.push(await photo(user));
      const names = docs.map(d => d.filename), later = await photo(user);
      const response = await batch(user, names), result = await response.json();
      assert.equal(result.deleted.length, 59);
      assert.equal(result.cleanupPending, false);
      assert.equal((await query("select id from photos where user_id=$1", [user.id])).rowCount, 1);
      assert.ok(await rowExists(later.id));
      assert.ok(await exists(later.storage_path));
      const retry = await (await batch(user, names)).json();
      assert.equal(retry.deleted.length, 0); assert.equal(retry.missing.length, 59);
      assert.equal((await query("select documents_deleted_total as n from users where id=$1", [user.id])).rows[0].n, 59);
    });

    await t.test("processing and unsafe paths fail individually without losing successful deletions", async () => {
      const user = await owner(), good = await photo(user), busy = await photo(user, { status: "processing" });
      const unsafe = await photo(user);
      await query("update photos set storage_path=$2 where id=$1", [unsafe.id, path.join(root, "outside", "unsafe.jpg")]);
      const result = await (await batch(user, [good.filename, busy.filename, unsafe.filename])).json();
      assert.deepEqual(result.deleted, [good.filename]);
      assert.deepEqual(result.failed.map(f => f.code), ["DOCUMENT_BUSY", "UNSAFE_DOCUMENT_FILE"]);
      assert.ok(await rowExists(busy.id)); assert.ok(await exists(busy.storage_path));
      assert.ok(await rowExists(unsafe.id)); assert.ok(await exists(unsafe.storage_path));
    });

    await t.test("a database rollback leaves every document and original intact", async () => {
      const user = await owner(), doc = await photo(user);
      const jobsBefore = (await query("select count(*)::int as n from account_deletion_jobs")).rows[0].n;
      await assert.rejects(deletePhotosForUser(user.id, [doc.filename], {
        transaction: callback => withTransaction(async client => { await callback(client); throw Error("synthetic commit failure"); })
      }), /synthetic commit failure/);
      assert.ok(await rowExists(doc.id)); assert.ok(await exists(doc.storage_path));
      assert.equal((await query("select documents_deleted_total as n from users where id=$1", [user.id])).rows[0].n, 0);
      assert.equal((await query("select count(*)::int as n from account_deletion_jobs")).rows[0].n, jobsBefore);
    });

    await t.test("file IO failure is durably retried after the record is deleted", async () => {
      const user = await owner(), doc = await photo(user);
      const result = await deletePhotosForUser(user.id, [doc.filename], {
        cleanup: (id, options) => cleanupAccountDeletion(id, { ...options, remove: async () => { throw Object.assign(Error("synthetic"), { code: "EACCES" }); } })
      });
      assert.deepEqual(result.deleted, [doc.filename]); assert.equal(result.cleanupPending, true);
      assert.equal(await rowExists(doc.id), false); assert.ok(await exists(doc.storage_path));
      await cleanupPendingAccountDeletions({ dryRun: false, log: () => {} });
      assert.equal(await exists(doc.storage_path), false);
    });

    await t.test("an account operation prevents deletion, and deletion excludes another operation", async () => {
      const user = await owner(), doc = await photo(user);
      const release = await acquireAccountOperationLock(user.id);
      try { const response = await batch(user, [doc.filename]); assert.equal(response.status, 409); assert.equal((await response.json()).error, "ACCOUNT_BUSY"); }
      finally { await release(); }
      assert.ok(await rowExists(doc.id)); assert.ok(await exists(doc.storage_path));
      const releaseExclusive = await acquireAccountOperationLock(user.id, { exclusive: true });
      try { assert.equal(await acquireAccountOperationLock(user.id), null); }
      finally { await releaseExclusive(); }
      const single = await fetch(`${base}/api/photos/${encodeURIComponent(doc.filename)}`, { method: "DELETE", headers: { "x-test-user": user.id } });
      assert.equal(single.status, 200); assert.equal(await exists(doc.storage_path), false);
    });

    await t.test("claimed guest copies and original sources disappear; tombstone prevents resurrection", async () => {
      const user = await owner(), doc = await photo(user);
      const session = (await query("insert into guest_sessions(session_token,converted_user_id) values($1,$2) returning id", [crypto.randomUUID(), user.id])).rows[0];
      const source = path.join(guestUploadsDir, `${crypto.randomUUID()}.jpg`);
      await fs.writeFile(source, "synthetic guest original");
      await query(`insert into guest_document_claims(guest_document_id,guest_session_id,photo_id,user_id,expires_at,source_path)
        values(900001,$1,$2,$3,now()+interval '1 hour',$4)`, [session.id, doc.id, user.id, source]);
      await query(`insert into guest_file_intents(id,kind,guest_session_id,guest_document_id,user_id,source_path,destination_path,created_at,expires_at)
        values($1,'copy',$2,900001,$3,$4,$5,now(),now()+interval '1 hour')`, [crypto.randomUUID(), session.id, user.id, source, doc.storage_path]);
      const result = await (await batch(user, [doc.filename])).json();
      assert.equal(result.cleanupPending, false);
      assert.equal(await exists(source), false); assert.equal(await exists(doc.storage_path), false);
      const claim = (await query("select * from guest_document_claims where guest_document_id=900001")).rows[0];
      assert.equal(claim.photo_id, null); assert.equal(claim.source_path, null);
      assert.equal((await query("select * from guest_documents_visible where guest_session_id=$1", [session.id])).rowCount, 0);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeAccountOperationLocks();
    await closeDatabaseConnection();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
    // This root was generated by mkdtemp above and holds synthetic files only.
    assert.ok(path.dirname(root) === os.tmpdir() && path.basename(root).startsWith("myworld-photo-delete-"));
    await fs.rm(root, { recursive: true, force: true });
  }
});
