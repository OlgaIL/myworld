import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import express from "express";
import { listAdminUsers, getAdminUsersSummary, parseAdminUserFilters } from "../repositories/adminUsersRepository.js";
import { createAdminUsersRouter } from "../routes/adminUsersRoutes.js";

// Disposable tables in a fresh schema; never operate on the application's rows.
const env = dotenv.parse(fs.readFileSync(new URL("../.env", import.meta.url)));
const url = new URL(env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "LOCAL_DATABASE_REQUIRED");
const schema = `admin_directory_test_${crypto.randomUUID().replaceAll("-", "")}`;
const bootstrap = new pg.Pool({ connectionString: url.toString() });
let pool, server, base;
const execute = (sql, params) => pool.query(sql, params);
const list = filters => listAdminUsers(parseAdminUserFilters(filters), { execute });

before(async () => {
  await bootstrap.query(`create schema ${schema}`);
  pool = new pg.Pool({ connectionString: url.toString(), options: `-c search_path=${schema}` });
  await pool.query(`create table users (id bigint primary key, email text, display_name text, created_at timestamptz,
    last_processing_at timestamptz, records_processed_total int default 0, processing_quota int default 0);
    create table photos (id serial primary key, user_id bigint, status text, created_at timestamptz default now());
    create table guest_documents (claimed_photo_id bigint);
    create table guest_document_claims (photo_id bigint);
    create table payments (id serial primary key, user_id bigint, status text);
    insert into users(id,email,display_name,created_at)
      select n, 'user' || n || '@example.test', 'Имя ' || n, '2026-10-10 12:00:00+00' from generate_series(1,62) n;
    update users set last_processing_at=now()-interval '2 days', records_processed_total=9 where id=1;
    update users set last_processing_at=now()-interval '20 days', records_processed_total=1 where id=2;
    update users set records_processed_total=3 where id=3;
    update users set processing_quota=999 where id=4;
    update users set email='100%_literal@example.test' where id=5;
    update users set email='boundary-start@example.test', created_at='2026-10-21 21:00:00+00' where id=61;
    update users set email='boundary-before@example.test', created_at='2026-10-21 20:59:59+00' where id=62;
    insert into payments(user_id,status) values(1,'succeeded'),(1,'succeeded'),(2,'failed'),(3,'pending');
    insert into photos(user_id,status) values(1,'processed'),(1,'recognized'),(2,'processed');`);
  const app = express();
  app.use(createAdminUsersRouter({
    requireAdmin: (req, res, next) => req.get("X-Test-Admin") === "yes" ? next() : res.sendStatus(401),
    mapUser: user => ({ id: user.id, email: user.email, paid: user.has_successful_purchase }),
    loadVisits: async users => { assert.ok(users.length <= 25); return {}; },
    listUsers: filters => listAdminUsers(filters, { execute }), summary: () => getAdminUsersSummary({ execute })
  }));
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await bootstrap.query(`drop schema if exists ${schema} cascade`);
  await bootstrap.end();
});

test("stable pages, clamping, empty search and global totals stay independent", async () => {
  const first = await list({});
  const second = await list({ page: "2" });
  const last = await list({ page: "999" });
  assert.equal(first.users.length, 25);
  assert.equal(first.total, 62);
  assert.equal(last.page, 3);
  assert.equal(last.users.length, 12);
  assert.equal(new Set([...first.users, ...second.users, ...last.users].map(u => u.id)).size, 62);
  const empty = await list({ search: "does-not-exist" });
  assert.deepEqual([empty.users.length, empty.total, empty.page], [0, 0, 1]);
  assert.deepEqual(await getAdminUsersSummary({ execute }), { usersCount: 62, documentsCount: 3 });
});
test("paid means succeeded payment, never pending, gifts, manual quota, or duplicated payments", async () => {
  const paid = await list({ payment: "paid" });
  assert.deepEqual(paid.users.map(u => u.id), ["1"]);
  assert.equal((await list({ payment: "unpaid" })).total, 61);
  assert.equal((await list({ payment: "paid", search: "user2@" })).total, 0);
});
test("literal case-insensitive name/email and numeric ID searches are parameterized", async () => {
  assert.equal((await list({ search: "USER1@" })).users[0].id, "1");
  assert.equal((await list({ search: "ИМЯ 12" })).users[0].id, "12");
  assert.equal((await list({ search: "42" })).users.some(u => u.id === "42"), true);
  assert.equal((await list({ search: "%_" })).total, 1);
  assert.equal((await list({ search: "' OR 1=1 --" })).total, 0);
});
test("inclusive custom registration dates use Istanbul midnight, without server timezone assumptions", async () => {
  const result = await list({ search: "boundary", registered: "custom", from: "2026-10-22", to: "2026-10-22" });
  assert.deepEqual(result.users.map(u => u.id), ["61"]);
});
test("processing history survives document deletion and is different from registration", async () => {
  assert.deepEqual((await list({ activity: "7d" })).users.map(u => u.id), ["1"]);
  assert.equal((await list({ activity: "30d" })).total, 2);
  assert.equal((await list({ activity: "never", search: "user3@" })).total, 0);
  const ordered = await list({ sort: "documents" });
  assert.deepEqual(ordered.users.slice(0, 2).map(u => u.id), ["1", "2"]);
});
test("auth, invalid filters, no-store and bounded response work over real HTTP", async () => {
  assert.equal((await fetch(`${base}/admin-api/users`)).status, 401);
  assert.equal((await fetch(`${base}/admin-api/users-summary`)).status, 401);
  const headers = { "X-Test-Admin": "yes" };
  for (const query of ["page=0", "page=1x", "payment=unknown", "sort=__proto__", "search=a&search=b", "registered=custom&from=2026-02-30&to=2026-03-01"]) {
    assert.equal((await fetch(`${base}/admin-api/users?${query}`, { headers })).status, 400);
  }
  const response = await fetch(`${base}/admin-api/users?page=2`, { headers });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = await response.json();
  assert.deepEqual([data.total, data.page, data.pageSize, data.users.length], [62, 2, 25, 25]);
  const summary = await (await fetch(`${base}/admin-api/users-summary`, { headers })).json();
  assert.equal(summary.usersCount, 62);
});
