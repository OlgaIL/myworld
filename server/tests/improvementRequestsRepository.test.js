import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import {
  createImprovementRequest,
  listImprovementRequestsForPhoto,
  listImprovementRequestsForUser
} from "../repositories/improvementRequestsRepository.js";

const testId = crypto.randomUUID();
let userId;
let photoId;

before(async () => {
  const table = await query("select to_regclass('public.recognition_improvement_requests') as table_name");
  assert.equal(
    table.rows[0].table_name,
    "recognition_improvement_requests",
    "Run db:migrate before the improvement request repository tests"
  );

  const user = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`improvement-${testId}@example.test`, "Improvement test"]
  );
  userId = user.rows[0].id;

  const photo = await query(
    `
      insert into photos (user_id, filename, storage_path, status)
      values ($1, $2, $3, 'processed')
      returning id
    `,
    [userId, `improvement-${testId}.jpg`, `test/${testId}.jpg`]
  );
  photoId = photo.rows[0].id;
});

after(async () => {
  if (userId) {
    await query("delete from users where id = $1", [userId]);
  }
  await closeDatabaseConnection();
});

test("keeps one active request and exposes request history", async () => {
  const first = await createImprovementRequest({
    userId,
    photoId,
    comment: "Не распознан второй столбец",
    consentVersion: "2026-08-21"
  });
  const repeated = await createImprovementRequest({
    userId,
    photoId,
    comment: "Повторный клик",
    consentVersion: "2026-08-21"
  });

  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.request.id, first.request.id);

  const photoRequests = await listImprovementRequestsForPhoto({ userId, photoId });
  const userRequests = await listImprovementRequestsForUser(userId);
  assert.equal(photoRequests.length, 1);
  assert.equal(userRequests.length, 1);
  assert.equal(userRequests[0].filename, `improvement-${testId}.jpg`);
});

test("removes requests when the source document is deleted", async () => {
  await query("delete from photos where id = $1", [photoId]);
  const result = await query(
    "select count(*)::int as count from recognition_improvement_requests where photo_id = $1",
    [photoId]
  );

  assert.equal(result.rows[0].count, 0);
  photoId = null;
});
