import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import authRoutes from "../routes/authRoutes.js";

const testId = crypto.randomUUID();
let appServer;
let baseUrl;
let userId;

before(async () => {
  const user = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`analytics-route-${testId}@example.test`, "Analytics route test"]
  );
  userId = user.rows[0].id;

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: userId };
    next();
  });
  app.use(authRoutes);

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

test("stores only validated ClientID and coarse device fields", async () => {
  const response = await fetch(`${baseUrl}/api/analytics/identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      metrikaClientId: "123456789",
      deviceType: "mobile",
      deviceOs: "android",
      deviceBrowser: "yandex",
      email: "must-not-be-stored@example.test"
    })
  });

  assert.equal(response.status, 204);
  const user = (await query(
    "select metrika_client_id, first_device_type, first_device_os, first_device_browser from users where id = $1",
    [userId]
  )).rows[0];
  assert.deepEqual(user, {
    metrika_client_id: "123456789",
    first_device_type: "mobile",
    first_device_os: "android",
    first_device_browser: "yandex"
  });
});

test("rejects an empty or unsafe analytics identity", async () => {
  const response = await fetch(`${baseUrl}/api/analytics/identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metrikaClientId: "not-a-client-id", deviceType: "phone" })
  });

  assert.equal(response.status, 400);
});
