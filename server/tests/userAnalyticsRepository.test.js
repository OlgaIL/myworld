import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import {
  createPhoto,
  deletePhoto,
  updatePhotoProcessingResultAndRecordSuccess
} from "../repositories/photosRepository.js";
import { saveUserAnalyticsIdentity } from "../repositories/usersRepository.js";

const testId = crypto.randomUUID();
let userId;
let photoId;

before(async () => {
  const user = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`analytics-${testId}@example.test`, "Analytics test"]
  );
  userId = user.rows[0].id;
});

after(async () => {
  if (userId) {
    await query("delete from users where id = $1", [userId]);
  }
  await closeDatabaseConnection();
});

test("counts document creation, successful processing and deletion", async () => {
  const photo = await createPhoto({
    userId,
    filename: `analytics-${testId}.jpg`,
    storagePath: `test/${testId}.jpg`,
    status: "uploaded"
  });
  photoId = photo.id;

  let user = (await query("select * from users where id = $1", [userId])).rows[0];
  assert.equal(user.documents_created_total, 1);
  assert.equal(user.documents_deleted_total, 0);
  assert.equal(user.records_processed_total, 0);

  await updatePhotoProcessingResultAndRecordSuccess({
    id: photoId,
    userId,
    updates: {
      status: "processed",
      cleanText: "Готовый текст",
      errorMessage: null,
      processedAt: new Date()
    }
  });

  user = (await query("select * from users where id = $1", [userId])).rows[0];
  assert.equal(user.records_processed_total, 1);
  assert.ok(user.last_processing_at);

  await deletePhoto(photoId);
  photoId = null;
  user = (await query("select * from users where id = $1", [userId])).rows[0];
  assert.equal(user.documents_created_total, 1);
  assert.equal(user.documents_deleted_total, 1);
});

test("keeps the first ClientID and first device", async () => {
  await saveUserAnalyticsIdentity(userId, {
    metrikaClientId: "111",
    deviceType: "mobile",
    deviceOs: "android",
    deviceBrowser: "yandex"
  });
  await saveUserAnalyticsIdentity(userId, {
    metrikaClientId: "222",
    deviceType: "desktop",
    deviceOs: "windows",
    deviceBrowser: "chrome"
  });

  const user = (await query("select * from users where id = $1", [userId])).rows[0];
  assert.equal(user.metrika_client_id, "111");
  assert.equal(user.first_device_type, "mobile");
  assert.equal(user.first_device_os, "android");
  assert.equal(user.first_device_browser, "yandex");
});
