import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import adminRoutes from "../routes/adminRoutes.js";

const testId = crypto.randomUUID();
let appServer;
let baseUrl;
let userId;

before(async () => {
  const user = await query(
    `
      insert into users (
        email,
        display_name,
        records_processed_total,
        last_processing_at,
        acquisition_context,
        first_device_type,
        first_device_os,
        first_device_browser,
        metrika_client_id,
        documents_created_total,
        documents_deleted_total,
        documents_history_complete
      )
      values ($1, $2, 11, now(), $3::jsonb, 'mobile', 'android', 'yandex', '987654321', 5, 5, true)
      returning id
    `,
    [
      `admin-analytics-${testId}@example.test`,
      "Admin analytics test",
      JSON.stringify({ utm_source: "yandex-direct", utm_campaign: "campaign", utm_term: "phrase" })
    ]
  );
  userId = user.rows[0].id;

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

test("maps compact and detailed user analytics without personal Metrika parameters", async () => {
  const [listResponse, detailResponse] = await Promise.all([
    fetch(`${baseUrl}/admin-api/users`),
    fetch(`${baseUrl}/admin-api/users/${userId}`)
  ]);
  const users = await listResponse.json();
  const detail = await detailResponse.json();
  const listed = users.find((user) => String(user.id) === String(userId));

  assert.equal(listResponse.status, 200);
  assert.equal(detailResponse.status, 200);
  assert.equal(listed.recordsProcessedTotal, 11);
  assert.ok(listed.lastProcessingAt);
  assert.equal(listed.firstDeviceType, "mobile");
  assert.equal(listed.metrikaClientId, "987654321");
  assert.equal(listed.metrikaVisitsCount, null);
  assert.equal(listed.metrikaVisitsStatus, "disabled");
  assert.equal(listed.metrikaVisitsPeriodStart, "2026-01-01");
  assert.equal(listed.documentsCreatedTotal, 5);
  assert.equal(listed.documentsDeletedTotal, 5);
  assert.equal(listed.documentsHistoryComplete, true);
  assert.equal(detail.acquisitionContext.utm_term, "phrase");
  assert.equal("email" in detail.acquisitionContext, false);
});
