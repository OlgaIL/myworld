import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import http from "node:http";
import pg from "pg";

const databaseUrl = process.env.TIMEWEB_TEST_DATABASE_URL;

test("synthetic localhost schema: migration keeps rows; failed retry keeps OCR/no credit; successful retry charges once", { skip: !databaseUrl }, async () => {
  const url = new URL(databaseUrl);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "localhost DB only");
  assert.ok(["postgresql:", "postgres:"].includes(url.protocol));
  const schema = `timeweb_synthetic_${Date.now()}_${process.pid}`;
  assert.match(schema, /^timeweb_synthetic_\d+_\d+$/);
  const client = new pg.Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  let appServer, gateway, closeDatabaseConnection, closeAccountOperationLocks, closeGuestStorageLocks;
  try {
    await client.query(`create schema ${schema}`);
    await client.query(`set search_path to ${schema}`);
    const dir = new URL("../db/migrations/", import.meta.url);
    for (const name of (await fs.readdir(dir)).filter((name) => name.endsWith(".sql")).sort()) {
      if (name === "036_timeweb_llm_provider.sql") {
        await client.query("insert into llm_attempt_events (started_at,audience,pipeline,provider,trigger,input_kind,outcome,duration_ms) values (now(),'guest','standard','yandex','upload','text','success',1)");
      }
      await client.query(await fs.readFile(new URL(name, dir), "utf8"));
    }
    assert.equal((await client.query("select provider from llm_attempt_events")).rows[0].provider, "yandex");
    await assert.rejects(client.query("insert into llm_attempt_events (started_at,audience,pipeline,provider,trigger,input_kind,outcome,duration_ms) values (now(),'guest','standard','invalid','upload','text','success',1)"), { code: "23514" });
    let succeed = false, gatewayCalls = 0;
    gateway = http.createServer(async (req, res) => {
      for await (const _chunk of req) { /* consume synthetic request */ }
      gatewayCalls++;
      res.setHeader("Content-Type", "application/json");
      const content = succeed ? JSON.stringify({ title: "Учебная запись", summary: "План", category: "Другое", section: "Другое", topic: "Учеба", tags: [],
        formattedContent: { blocks: [{ type: "paragraph", text: "Синтетический учебный план." }] },
        hasTable: false, hasFormulas: false, hasRecognitionErrors: false, textQuality: "good", corrections: [], notes: "" }) : "{}";
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));
    });
    await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    url.searchParams.set("options", `-csearch_path=${schema}`);
    process.env.DATABASE_URL = url.href;
    Object.assign(process.env, { PROCESSING_MODE_OVERRIDE: "standard", PROCESSING_STANDARD_AI_PROVIDER: "timeweb",
      PROCESSING_FREE_AI_PROVIDER: "timeweb", PROCESSING_PAID_AI_PROVIDER: "timeweb",
      PROCESSING_GUEST_AI_PROVIDER: "timeweb", PROCESSING_GUEST_OCR_PROVIDER: "google", GUEST_DOCUMENT_LIMIT: "5",
      PROCESSING_STANDARD_OCR_PROVIDER: "google", PROCESSING_FREE_OCR_PROVIDER: "google",
      PROCESSING_ALLOWLIST_EMAILS: "", PROCESSING_ENABLED: "true", GOOGLE_OCR_ENABLED: "true",
      TIMEWEB_AI_ENABLED: "true", TIMEWEB_API_KEY: "synthetic-only", TIMEWEB_MODEL: "openai/gpt-4.1-mini",
      TIMEWEB_BASE_URL: `http://127.0.0.1:${gateway.address().port}/v1` });
    const express = (await import("express")).default;
    const db = await import("../db/index.js");
    closeDatabaseConnection = db.closeDatabaseConnection;
    closeAccountOperationLocks = (await import("../services/accountOperationLocks.js")).closeAccountOperationLocks;
    closeGuestStorageLocks = (await import("../services/guestStorageLocks.js")).closeGuestStorageLocks;
    const { AI_CATEGORIES, AI_SECTIONS, AI_TEXT_QUALITY_VALUES } = await import("../services/aiPrompt.js");
    // The synthetic success uses actual allowed enum values, never a model-specific contract.
    gateway.removeAllListeners("request");
    gateway.on("request", async (req, res) => {
      for await (const _chunk of req) {}
      gatewayCalls++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: succeed ? JSON.stringify({
        title: "План", summary: "Учеба", category: AI_CATEGORIES[0], section: AI_SECTIONS[0], topic: "План", tags: [],
        formattedContent: { blocks: [{ type: "paragraph", text: "Синтетический учебный план." }] },
        hasTable: false, hasFormulas: false, hasRecognitionErrors: false, textQuality: AI_TEXT_QUALITY_VALUES[0], corrections: [], notes: ""
      }) : "{}" } }] }));
    });
    const user = (await client.query("insert into users (google_id,email,display_name) values ('synthetic','synthetic@example.test','Synthetic') returning *")).rows[0];
    const { createPhoto } = await import("../repositories/photosRepository.js");
    const text = "Синтетический исходный текст для повторного оформления.";
    const photo = await createPhoto({ userId: user.id, filename: "synthetic-never-read.jpg", storagePath: "nonexistent-synthetic-file", status: "recognized", ocrText: text, cleanText: text });
    const app = express();
    app.use((req, _res, next) => { req.user = { id: user.id, processingMode: "standard", email: user.email }; next(); });
    app.use((await import("../routes/photoRoutes.js")).default);
    app.use((await import("../routes/guestRoutes.js")).default);
    appServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    const endpoint = `http://127.0.0.1:${appServer.address().port}/api/photos/${photo.filename}/process`;
    const before = (await client.query("select records_processed_total,processing_used from users where id=$1", [user.id])).rows[0];
    const failure = await (await fetch(endpoint, { method: "POST" })).json();
    assert.equal(failure.status, "recognized");
    const stored = (await client.query("select status,ocr_text,error_message from photos where id=$1", [photo.id])).rows[0];
    assert.equal(stored.ocr_text, text);
    assert.equal(stored.status, "recognized");
    assert.match(stored.error_message, /TIMEWEB_INVALID_JSON/);
    assert.deepEqual((await client.query("select records_processed_total,processing_used from users where id=$1", [user.id])).rows[0], before);
    succeed = true;
    const success = await (await fetch(endpoint, { method: "POST" })).json();
    assert.equal(success.status, "processed");
    assert.equal(gatewayCalls, 2); // OCR would fail on the nonexistent file if retried.
    const after = (await client.query("select records_processed_total,processing_used from users where id=$1", [user.id])).rows[0];
    assert.equal(Number(after.records_processed_total), Number(before.records_processed_total) + 1);
    const events = (await client.query("select provider,outcome,trigger from llm_attempt_events where provider='timeweb' order by id")).rows;
    assert.deepEqual(events, [{ provider: "timeweb", outcome: "error", trigger: "retry" }, { provider: "timeweb", outcome: "success", trigger: "retry" }]);
    // Guest retry follows its actual cookie/session route and must charge a slot only once.
    const { createGuestSession } = await import("../repositories/guestSessionsRepository.js");
    const { createGuestDocument, updateGuestDocumentProcessingResult } = await import("../repositories/guestDocumentsRepository.js");
    const { buildRecognizedResult } = await import("../services/partialProcessingService.js");
    const session = await createGuestSession({ sessionToken: "synthetic-timeweb-session" });
    const guest = await createGuestDocument({ guestSessionId: session.id, filename: "synthetic-guest-never-read.jpg", storagePath: "nonexistent-synthetic-guest-file" });
    await updateGuestDocumentProcessingResult(guest.id, buildRecognizedResult(text, "Timeweb: TIMEWEB_TIMEOUT"));
    const guestEndpoint = `http://127.0.0.1:${appServer.address().port}/api/guest/documents/${guest.id}/retry-processing`;
    const guestRequest = { method: "POST", headers: { Cookie: "guest_session_token=synthetic-timeweb-session" } };
    succeed = false;
    const guestFailure = await (await fetch(guestEndpoint, guestRequest)).json();
    assert.equal(guestFailure.document.status, "recognized");
    assert.equal(guestFailure.access.documentsUsed, 0);
    const storedGuest = (await client.query("select status,ocr_text from guest_documents where id=$1", [guest.id])).rows[0];
    assert.equal(storedGuest.ocr_text, text);
    assert.equal(storedGuest.status, "recognized");
    assert.equal(Number((await client.query("select documents_used from guest_sessions where id=$1", [session.id])).rows[0].documents_used), 0);
    succeed = true;
    const guestSuccess = await (await fetch(guestEndpoint, guestRequest)).json();
    assert.equal(guestSuccess.document.status, "processed");
    assert.equal(guestSuccess.access.documentsUsed, 1);
    assert.equal(gatewayCalls, 4); // All retries reuse OCR; nonexistent image paths are never opened.
    const duplicate = await fetch(guestEndpoint, guestRequest);
    assert.equal(duplicate.status, 409);
    assert.equal(gatewayCalls, 4);
    assert.equal(Number((await client.query("select documents_used from guest_sessions where id=$1", [session.id])).rows[0].documents_used), 1);
    const guestEvents = (await client.query("select provider,outcome,trigger from llm_attempt_events where audience='guest' and provider='timeweb' order by id")).rows;
    assert.deepEqual(guestEvents, events);
  } finally {
    for (const server of [appServer, gateway]) if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (closeAccountOperationLocks) await closeAccountOperationLocks();
    if (closeGuestStorageLocks) await closeGuestStorageLocks();
    if (closeDatabaseConnection) await closeDatabaseConnection();
    await client.query(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
