import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ quiet: true });
const baseUrl = process.env.DATABASE_URL;
const databaseHost = baseUrl ? new URL(baseUrl).hostname : "";
const localOnly = ["localhost", "127.0.0.1", "[::1]"].includes(databaseHost);

test("tables route: free failed attempt preserves trial, used trial locks, package and saved table remain accessible", { skip: !localOnly }, async () => {
  const schema = `table_synthetic_${crypto.randomBytes(6).toString("hex")}`;
  const databaseUrl = new URL(baseUrl);
  databaseUrl.searchParams.set("options", `-csearch_path=${schema}`);
  const admin = new pg.Client({ connectionString: baseUrl, ssl: false });
  let appServer;
  let closeDatabaseConnection;
  let closeAccountOperationLocks;
  await admin.connect();
  try {
    await admin.query(`create schema ${schema}`);
    const schemaDb = new pg.Client({ connectionString: databaseUrl.href, ssl: false });
    await schemaDb.connect();
    try {
      const migrations = new URL("../db/migrations/", import.meta.url);
      for (const name of (await fs.readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
        await schemaDb.query(await fs.readFile(new URL(name, migrations), "utf8"));
      }
      process.env.DATABASE_URL = databaseUrl.href;
      const express = (await import("express")).default;
      const db = await import("../db/index.js");
      closeDatabaseConnection = db.closeDatabaseConnection;
      closeAccountOperationLocks = (await import("../services/accountOperationLocks.js")).closeAccountOperationLocks;
      const app = express();
      app.use((req, _res, next) => {
        const id = Number(req.headers["x-test-user"]);
        if (id) req.user = { id };
        next();
      });
      app.use((await import("../routes/photoRoutes.js")).default);
      appServer = await new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => resolve(server));
      });
      const user = (await schemaDb.query(
        "insert into users (google_id, email, display_name, processing_quota) values ('gift', 'gift@example.test', 'Gift', 1) returning id"
      )).rows[0];
      const other = (await schemaDb.query(
        "insert into users (google_id, email, display_name) values ('free', 'free@example.test', 'Free') returning id"
      )).rows[0];
      const { mapUserForSession } = await import("../repositories/usersRepository.js");
      assert.equal(mapUserForSession((await schemaDb.query("select * from users where id = $1", [other.id])).rows[0]).tableTrialAvailable, true);
      const photo = (await schemaDb.query(
        `insert into photos (user_id, filename, storage_path, status, has_table, ocr_text, mime_type)
         values ($1, 'synthetic-table.jpg', 'nonexistent-test-file', 'processed', true, 'Таблица 1', 'image/jpeg') returning id`,
        [user.id]
      )).rows[0];
      const endpoint = `http://127.0.0.1:${appServer.address().port}/api/photos/synthetic-table.jpg/tables`;
      assert.equal((await fetch(endpoint, { method: "POST" })).status, 401);
      assert.equal((await fetch(endpoint, { method: "POST", headers: { "x-test-user": other.id } })).status, 404);
      await schemaDb.query("update photos set user_id = $1 where id = $2", [other.id, photo.id]);
      const freeAttempt = await fetch(endpoint, { method: "POST", headers: { "x-test-user": other.id } });
      assert.equal(freeAttempt.status, 200);
      assert.equal((await freeAttempt.json()).tableErrorCode, "TABLE_IMAGE_MISSING");
      assert.equal((await schemaDb.query("select table_trial_used_at from users where id = $1", [other.id])).rows[0].table_trial_used_at, null);
      await schemaDb.query("update users set table_trial_used_at = now() where id = $1", [other.id]);
      assert.equal(mapUserForSession((await schemaDb.query("select * from users where id = $1", [other.id])).rows[0]).tableTrialAvailable, false);
      const locked = await fetch(endpoint, { method: "POST", headers: { "x-test-user": other.id } });
      assert.equal(locked.status, 403);
      assert.equal((await locked.json()).error, "TABLE_PACKAGE_REQUIRED");
      await schemaDb.query("update photos set user_id = $1 where id = $2", [user.id, photo.id]);
      const countersBefore = (await schemaDb.query(
        "select processing_used, records_processed_total from users where id = $1", [user.id]
      )).rows[0];
      const attempted = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(attempted.status, 200);
      assert.equal((await attempted.json()).tableErrorCode, "TABLE_IMAGE_MISSING");
      await schemaDb.query(
        "update photos set status = 'recognized', has_table = false, ocr_text = $2 where id = $1",
        [photo.id, 'Таблица 1 – Проверка\nНаименование 2027 г.']
      );
      const ocrOnly = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(ocrOnly.status, 200);
      assert.equal((await ocrOnly.json()).tableErrorCode, "TABLE_IMAGE_MISSING");
      assert.deepEqual((await schemaDb.query(
        "select processing_used, records_processed_total from users where id = $1", [user.id]
      )).rows[0], countersBefore);
      assert.equal((await schemaDb.query("select count(*)::int as n from llm_attempt_events")).rows[0].n, 0);
      await schemaDb.query(
        `update photos set table_status = 'ready', table_content =
          '{"blocks":[{"type":"table","headers":["A","B","C"],"rows":[["x","1","2"]]}]}'::jsonb
         where id = $1`, [photo.id]
      );
      await schemaDb.query("update users set processing_quota = 0 where id = $1", [user.id]);
      const cached = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(cached.status, 200);
      assert.equal((await cached.json()).tableContent.blocks[0].rows[0][1], "1");
      const metadata = await fetch(`http://127.0.0.1:${appServer.address().port}/api/photos-metadata`,
        { headers: { "x-test-user": user.id } });
      assert.equal((await metadata.json())[0].tableContent, null);
      const reopened = await fetch(endpoint, { headers: { "x-test-user": user.id } });
      assert.equal((await reopened.json()).tableContent.blocks[0].rows[0][2], "2");
    } finally {
      await schemaDb.end();
    }
  } finally {
    if (appServer) {
      appServer.closeAllConnections();
      await new Promise((resolve) => appServer.close(resolve));
    }
    if (closeAccountOperationLocks) await closeAccountOperationLocks();
    if (closeDatabaseConnection) await closeDatabaseConnection();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
