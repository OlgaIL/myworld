import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import improvementRequestRoutes from "../routes/improvementRequestRoutes.js";

const testId = crypto.randomUUID();
let appServer;
let baseUrl;
let userId;
let filename;

before(async () => {
  const table = await query("select to_regclass('public.recognition_improvement_requests') as table_name");
  assert.equal(table.rows[0].table_name, "recognition_improvement_requests");

  const user = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`improvement-route-${testId}@example.test`, "Improvement route test"]
  );
  userId = user.rows[0].id;
  filename = `improvement-route-${testId}.jpg`;

  await query(
    `
      insert into photos (user_id, filename, storage_path, status, text_quality)
      values ($1, $2, $3, 'processed', 'low_confidence')
    `,
    [userId, filename, `test/${testId}.jpg`]
  );

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: userId };
    next();
  });
  app.use(improvementRequestRoutes);

  await new Promise((resolve) => {
    appServer = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
  if (appServer) {
    await new Promise((resolve, reject) => appServer.close((error) => (error ? reject(error) : resolve())));
  }
  if (userId) {
    await query("delete from users where id = $1", [userId]);
  }
  await closeDatabaseConnection();
});

test("requires explicit manual review consent", async () => {
  const response = await fetch(`${baseUrl}/api/photos/${filename}/improvement-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: "Проверьте текст" })
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "MANUAL_REVIEW_CONSENT_REQUIRED" });
});

test("creates one request and returns it for repeated submissions", async () => {
  const request = () => fetch(`${baseUrl}/api/photos/${filename}/improvement-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manualReviewConsent: true, comment: "  Ошибка во втором столбце  " })
  });

  const createdResponse = await request();
  const created = await createdResponse.json();
  const repeatedResponse = await request();
  const repeated = await repeatedResponse.json();

  assert.equal(createdResponse.status, 201);
  assert.equal(repeatedResponse.status, 200);
  assert.equal(repeated.id, created.id);
  assert.equal(created.comment, "Ошибка во втором столбце");
  assert.equal(created.consentVersion, "2026-08-21");
});

test("returns request history for the document and user", async () => {
  const [photoResponse, userResponse] = await Promise.all([
    fetch(`${baseUrl}/api/photos/${filename}/improvement-requests`),
    fetch(`${baseUrl}/api/improvement-requests`)
  ]);
  const photoRequests = await photoResponse.json();
  const userRequests = await userResponse.json();

  assert.equal(photoResponse.status, 200);
  assert.equal(userResponse.status, 200);
  assert.equal(photoRequests.length, 1);
  assert.equal(userRequests.length, 1);
  assert.equal(userRequests[0].documentId, filename);
});
