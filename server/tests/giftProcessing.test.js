import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import { query, closeDatabaseConnection, getPool } from "../db/index.js";
import { grantGiftProcessing } from "../repositories/giftProcessingRepository.js";
import { incrementUserRecordsProcessedTotal, mapUserForSession } from "../repositories/usersRepository.js";
import { getUserProductAccess } from "../utils/photos.js";
import { getAccountDeletionEligibility } from "../services/accountDeletionService.js";
import adminRoutes from "../routes/adminRoutes.js";
import processingHistoryRoutes from "../routes/processingHistoryRoutes.js";
import photoRoutes from "../routes/photoRoutes.js";

const ids = [];
const token = crypto.randomBytes(32).toString("hex");
let server, base;
const read = async id => (await query("select * from users where id = $1", [id])).rows[0];
async function user({ limit = 3, total = 25, quota = 40, used = 22, unlimited = false, until = null } = {}) {
  const row = (await query(`insert into users(email,display_name,free_processing_limit,records_processed_total,processing_quota,
    processing_used,processing_enabled,access_expires_at) values ($1,'Synthetic gift user',$2,$3,$4,$5,$6,$7) returning *`,
  [`gift-${crypto.randomUUID()}@example.test`, limit, total, quota, used, unlimited, until])).rows[0];
  ids.push(row.id);
  return row;
}
const gift = (id, amount = 10, requestId = crypto.randomUUID()) => grantGiftProcessing(id, { amount, note: "Тестовый подарок", requestId }, "synthetic");
const post = (id, payload, headers = {}) => fetch(`${base}/admin-api/users/${id}/gifts`, {
  method: "POST", headers: { "Content-Type": "application/json", "X-Test-Admin": "yes", "X-Admin-Gift-CSRF": token, ...headers }, body: JSON.stringify(payload)
});

before(async () => {
  assert.match((await query("select current_schema() as name")).rows[0].name, /^admin_users_suite_/, "Disposable test schema required");
  const app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.session = { adminAuthenticated: req.get("x-test-admin") === "yes", accountDeletionCsrf: token };
    if (req.get("x-test-user")) req.user = mapUserForSession(await read(req.get("x-test-user")));
    next();
  });
  app.use(adminRoutes);
  app.use(processingHistoryRoutes);
  app.use(photoRoutes);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await query("delete from photos where user_id = any($1::int[])", [ids]);
  await query("delete from processing_credit_events where user_id = any($1::int[])", [ids]);
  await query("delete from payments where user_id = any($1::int[])", [ids]);
  await query("delete from users where id = any($1::int[])", [ids]);
  await closeDatabaseConnection();
});

test("gift survives historic package use, consumes before packages, and preserves all historic counters", async () => {
  const original = await user();
  await gift(original.id);
  let current = await read(original.id);
  assert.equal(current.records_processed_total, 25);
  assert.equal(current.free_processing_limit, 3);
  assert.equal(current.processing_quota, 40);
  assert.equal(current.processing_used, 22);
  assert.equal(getUserProductAccess(current, 25).freeRemaining, 10);
  assert.equal(getUserProductAccess(mapUserForSession(current), 25).totalRemaining, 28);
  for (let n = 0; n < 10; n++) await incrementUserRecordsProcessedTotal(original.id);
  current = await read(original.id);
  assert.equal(current.gift_processing_used, 10);
  assert.equal(current.processing_used, 22);
  assert.equal(current.records_processed_total, 35);
  await incrementUserRecordsProcessedTotal(original.id);
  assert.equal((await read(original.id)).processing_used, 23);
  await gift(original.id, 2);
  current = await read(original.id);
  assert.equal(getUserProductAccess(current, current.records_processed_total).freeRemaining, 2);
});

test("initial free allowance comes first; gifts pause during unlimited and dated access", async () => {
  const initial = await user({ limit: 3, total: 2, used: 0 });
  await gift(initial.id, 2);
  await incrementUserRecordsProcessedTotal(initial.id);
  assert.equal((await read(initial.id)).gift_processing_used, 0);
  await incrementUserRecordsProcessedTotal(initial.id);
  assert.equal((await read(initial.id)).gift_processing_used, 1);
  for (const options of [{ unlimited: true }, { until: "2099-01-01" }]) {
    const row = await user(options);
    await gift(row.id);
    await incrementUserRecordsProcessedTotal(row.id);
    const current = await read(row.id);
    assert.equal(current.gift_processing_used, 0);
    assert.equal(current.processing_used, row.processing_used);
  }
});

test("concurrent retries grant once; conflicting reuse fails; concurrent consumption loses no credits", async () => {
  const row = await user();
  const requestId = crypto.randomUUID();
  await Promise.all(Array.from({ length: 8 }, () => gift(row.id, 10, requestId)));
  assert.equal((await read(row.id)).gift_processing_quota, 10);
  assert.equal((await query("select count(*)::int as count from gift_processing_events where user_id=$1", [row.id])).rows[0].count, 1);
  await assert.rejects(() => gift(row.id, 11, requestId), { message: "GIFT_REQUEST_CONFLICT" });
  await Promise.all([...Array.from({ length: 5 }, () => gift(row.id, 2)),
    ...Array.from({ length: 5 }, () => incrementUserRecordsProcessedTotal(row.id))]);
  const current = await read(row.id);
  assert.equal(current.gift_processing_quota, 20);
  assert.equal(current.gift_processing_used, 5);
  assert.equal(current.processing_used, 22);
});

test("real admin HTTP enforces authentication, CSRF, integer amount, reason, missing account and retry payload", async () => {
  const row = await user();
  const payload = { amount: 10, note: "Компенсация", requestId: crypto.randomUUID() };
  assert.equal((await post(row.id, payload, { "X-Test-Admin": "no" })).status, 401);
  assert.equal((await post(row.id, payload, { "X-Admin-Gift-CSRF": "wrong" })).status, 403);
  assert.equal((await post(row.id, payload, { Origin: "https://outside.example" })).status, 403);
  assert.equal((await post(row.id, payload, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  for (const patch of [{ amount: 0 }, { amount: 1.5 }, { amount: "10" }, { amount: 10001 }, { note: " " }, { note: "x".repeat(501) }, { requestId: "wrong" }]) {
    assert.equal((await post(row.id, { ...payload, ...patch })).status, 400);
  }
  assert.equal((await post("2147482999", payload)).status, 404);
  const response = await post(row.id, payload);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const saved = (await response.json()).user;
  assert.equal(saved.hasSuccessfulPurchase, false);
  assert.equal(saved.giftProcessingQuota, 10);
  assert.equal(saved.gifts.length, 1);
  assert.equal(saved.gifts[0].created_by, "synthetic");
  assert.equal((await post(row.id, payload)).status, 200);
  assert.equal((await post(row.id, { ...payload, amount: 11 })).status, 409);
  assert.equal((await read(row.id)).gift_processing_quota, 10);
});

test("gift history uses its own consumption, leaves package history and purchase classification unchanged", async () => {
  const row = await user({ total: 5, used: 2, quota: 10 });
  await query("insert into processing_credit_events(user_id,source,package_title,amount) values($1,'manual','Ранее',10)", [row.id]);
  await gift(row.id, 3);
  await incrementUserRecordsProcessedTotal(row.id);
  const response = await fetch(`${base}/api/processing-history`, { headers: { "X-Test-User": String(row.id) } });
  assert.equal(response.status, 200);
  const history = await response.json();
  assert.equal(history.find(event => event.type === "gift").remaining, 2);
  assert.equal(history.find(event => event.type === "gift").used, 1);
  assert.equal(history.find(event => event.type === "manual").used, 2);
  assert.equal(history.find(event => event.type === "manual").remaining, 8);
  assert.equal(history.filter(event => event.type === "legacy").length, 0);
  const directory = await fetch(`${base}/admin-api/users?payment=paid&search=${row.email}`, { headers: { "X-Test-Admin": "yes" } });
  assert.equal((await directory.json()).total, 0);
  const credits = await fetch(`${base}/admin-api/processing-credits`, { headers: { "X-Test-Admin": "yes" } });
  assert.equal((await credits.json()).some(event => event.source === "gift" && String(event.userId) === String(row.id)), true);
});

test("a gift is not a paid-account deletion lock; paid records stay protected", async () => {
  const row = await user();
  await gift(row.id);
  const options = { protection: { valid: true, ids: [] } };
  assert.equal((await getAccountDeletionEligibility(row.id, null, options)).allowed, true);
  await query(`insert into payments(user_id,idempotence_key,package_title,package_amount,amount_value,status)
    values ($1,$2,'Тест',1,1,'pending')`, [row.id, crypto.randomUUID()]);
  assert.equal((await getAccountDeletionEligibility(row.id, null, options)).reason, "ACCOUNT_HAS_PAYMENTS");
});

test("gift balance unlocks tables after the trial, without invoking a model or spending processing", async () => {
  const row = await user({ quota: 0, used: 0 });
  await query("update users set table_trial_used_at = now() where id=$1", [row.id]);
  await gift(row.id, 1);
  const photo = (await query(`insert into photos(user_id,filename,storage_path,status,has_table)
    values ($1,$2,'synthetic-no-file','processed',true) returning id,filename`, [row.id, crypto.randomUUID() + '.jpg'])).rows[0];
  const lock = await getPool().connect();
  try {
    // Hold the next-stage photo lock so an allowed request stops before any LLM call.
    await lock.query("select pg_advisory_lock($1::int,hashtext($2))", [763654, String(photo.id)]);
    const response = await fetch(`${base}/api/photos/${photo.filename}/tables`, { method: "POST", headers: { "X-Test-User": String(row.id) } });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "TABLE_BUSY");
    assert.equal((await read(row.id)).gift_processing_used, 0);
    await incrementUserRecordsProcessedTotal(row.id);
    const exhausted = await fetch(`${base}/api/photos/${photo.filename}/tables`, { method: "POST", headers: { "X-Test-User": String(row.id) } });
    assert.equal(exhausted.status, 403);
    assert.equal((await exhausted.json()).error, "TABLE_PACKAGE_REQUIRED");
  } finally {
    await lock.query("select pg_advisory_unlock($1::int,hashtext($2))", [763654, String(photo.id)]);
    lock.release();
  }
});
