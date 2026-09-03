import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import { createPhoto, updatePhotoProcessingResult } from "../repositories/photosRepository.js";
import { incrementUserRecordsProcessedTotal } from "../repositories/usersRepository.js";
import { getUserProductAccess } from "../utils/photos.js";

const testId = crypto.randomUUID();
const userIds = [];

before(async () => {
  const newUser = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`free-new-${testId}@example.test`, "New free user"]
  );
  userIds.push(newUser.rows[0].id);

  const legacyUser = await query(
    `
      insert into users (
        email,
        display_name,
        free_processing_limit,
        records_processed_total,
        processing_quota,
        processing_used
      )
      values ($1, $2, 3, 2, 20, 0)
      returning id
    `,
    [`free-order-${testId}@example.test`, "Free order user"]
  );
  userIds.push(legacyUser.rows[0].id);
});

after(async () => {
  if (userIds.length > 0) {
    await query("delete from users where id = any($1::int[])", [userIds]);
  }
  await closeDatabaseConnection();
});

test("new users receive a fixed free limit of 10", async () => {
  const user = (await query("select * from users where id = $1", [userIds[0]])).rows[0];
  assert.equal(user.free_processing_limit, 10);

  const access = getUserProductAccess(user, user.records_processed_total);
  assert.equal(access.freeRemaining, 10);
  assert.equal(access.paidRemaining, 0);
  assert.equal(access.totalRemaining, 10);
});

test("keeps a user's stored legacy free limit", async () => {
  const user = (await query("select * from users where id = $1", [userIds[1]])).rows[0];
  assert.equal(user.free_processing_limit, 3);
  assert.equal(getUserProductAccess(user, 2).freeRemaining, 1);
});

test("consumes free processing before paid balance", async () => {
  await incrementUserRecordsProcessedTotal(userIds[1]);
  let user = (await query("select * from users where id = $1", [userIds[1]])).rows[0];
  assert.equal(user.records_processed_total, 3);
  assert.equal(user.processing_used, 0);

  await incrementUserRecordsProcessedTotal(userIds[1]);
  user = (await query("select * from users where id = $1", [userIds[1]])).rows[0];
  assert.equal(user.records_processed_total, 4);
  assert.equal(user.processing_used, 1);

  const access = getUserProductAccess(user, user.records_processed_total);
  assert.equal(access.freeRemaining, 0);
  assert.equal(access.paidRemaining, 19);
  assert.equal(access.totalRemaining, 19);
});

test("creating or unsuccessfully updating a document does not consume processing", async () => {
  const beforeUser = (await query("select * from users where id = $1", [userIds[0]])).rows[0];
  const photo = await createPhoto({
    userId: userIds[0],
    filename: `free-no-charge-${testId}.jpg`,
    storagePath: `test/free-no-charge-${testId}.jpg`,
    status: "uploaded"
  });

  await updatePhotoProcessingResult(photo.id, {
    status: "error",
    errorMessage: "test error",
    processedAt: new Date()
  });

  const afterUser = (await query("select * from users where id = $1", [userIds[0]])).rows[0];
  assert.equal(afterUser.records_processed_total, beforeUser.records_processed_total);
  assert.equal(afterUser.processing_used, beforeUser.processing_used);
});
