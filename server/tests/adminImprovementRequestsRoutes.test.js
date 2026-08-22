import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import { createImprovementRequest } from "../repositories/improvementRequestsRepository.js";
import adminRoutes from "../routes/adminRoutes.js";

const testId = crypto.randomUUID();
let appServer;
let baseUrl;
let userId;
let photoId;
let requestId;

before(async () => {
  const user = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`admin-improvement-${testId}@example.test`, "Admin improvement test"]
  );
  userId = user.rows[0].id;

  const photo = await query(
    `
      insert into photos (
        user_id,
        filename,
        storage_path,
        status,
        title,
        ocr_text,
        clean_text,
        text_quality
      )
      values ($1, $2, $3, 'processed', 'Тестовая запись', 'Исходный текст', 'Обработанный текст', 'low_confidence')
      returning id
    `,
    [userId, `admin-improvement-${testId}.jpg`, `test/${testId}.jpg`]
  );

  photoId = photo.rows[0].id;
  const created = await createImprovementRequest({
    userId,
    photoId,
    comment: "Проверьте формулу",
    consentVersion: "2026-08-21"
  });
  requestId = created.request.id;

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { adminAuthenticated: true };
    next();
  });
  app.use(adminRoutes);

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

test("returns the admin improvement queue and document details", async () => {
  const listResponse = await fetch(`${baseUrl}/admin-api/improvement-requests`);
  const list = await listResponse.json();
  const request = list.find((item) => item.id === String(requestId));

  assert.equal(listResponse.status, 200);
  assert.equal(request.documentTitle, "Тестовая запись");
  assert.equal(request.comment, "Проверьте формулу");

  const detailResponse = await fetch(`${baseUrl}/admin-api/improvement-requests/${requestId}`);
  const detail = await detailResponse.json();

  assert.equal(detailResponse.status, 200);
  assert.equal(detail.ocrText, "Исходный текст");
  assert.equal(detail.cleanText, "Обработанный текст");
  assert.equal(detail.originalCleanText, "Обработанный текст");
  assert.equal(detail.imageUrl, `/admin-api/improvement-requests/${requestId}/file`);
});

test("allows only transition to in-review at this stage", async () => {
  const invalidResponse = await fetch(`${baseUrl}/admin-api/improvement-requests/${requestId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "improved" })
  });
  assert.equal(invalidResponse.status, 400);

  const response = await fetch(`${baseUrl}/admin-api/improvement-requests/${requestId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_review" })
  });
  const updated = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updated.status, "in_review");
  assert.ok(updated.startedAt);
});

test("publishes improved text and preserves the original version", async () => {
  const response = await fetch(`${baseUrl}/admin-api/improvement-requests/${requestId}/result`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "improved",
      improvedText: "Улучшенный текст",
      adminComment: "Готово"
    })
  });
  const updated = await response.json();
  const photo = await query("select clean_text from photos where id = $1", [photoId]);

  assert.equal(response.status, 200);
  assert.equal(updated.status, "improved");
  assert.equal(updated.originalCleanText, "Обработанный текст");
  assert.equal(updated.improvedText, "Улучшенный текст");
  assert.equal(updated.adminComment, "Готово");
  assert.equal(photo.rows[0].clean_text, "Улучшенный текст");
});
