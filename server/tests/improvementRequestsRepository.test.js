import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import {
  completeImprovementRequestForAdmin,
  createImprovementRequest,
  findImprovementRequestForAdmin,
  listImprovementRequestsForAdmin,
  listImprovementRequestsForPhoto,
  listImprovementRequestsForUser,
  updateImprovementRequestStatusForAdmin
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
      insert into photos (user_id, filename, storage_path, status, ocr_text, clean_text, text_quality)
      values ($1, $2, $3, 'processed', 'Исходное распознавание', 'Первый результат', 'low_confidence')
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
  assert.equal(first.request.original_ocr_text, "Исходное распознавание");
  assert.equal(first.request.original_clean_text, "Первый результат");

  const photoRequests = await listImprovementRequestsForPhoto({ userId, photoId });
  const userRequests = await listImprovementRequestsForUser(userId);
  assert.equal(photoRequests.length, 1);
  assert.equal(userRequests.length, 1);
  assert.equal(userRequests[0].filename, `improvement-${testId}.jpg`);
});

test("stores the original version and publishes an improved result atomically", async () => {
  const request = (await listImprovementRequestsForPhoto({ userId, photoId }))[0];
  await updateImprovementRequestStatusForAdmin(request.id, "in_review");
  const result = await completeImprovementRequestForAdmin({
    id: request.id,
    status: "improved",
    improvedText: "Исправленный результат",
    adminComment: "Проверено вручную"
  });
  const photo = await query("select clean_text, formatted_content, formatted_at, text_quality from photos where id = $1", [photoId]);
  const detail = await findImprovementRequestForAdmin(request.id);

  assert.equal(result.conflict, false);
  assert.equal(detail.status, "improved");
  assert.equal(detail.original_clean_text, "Первый результат");
  assert.equal(detail.improved_text, "Исправленный результат");
  assert.equal(detail.admin_comment, "Проверено вручную");
  assert.equal(photo.rows[0].clean_text, "Исправленный результат");
  assert.deepEqual(photo.rows[0].formatted_content, {
    blocks: [{ type: "paragraph", text: "Исправленный результат" }]
  });
  assert.ok(photo.rows[0].formatted_at);
  assert.equal(photo.rows[0].text_quality, "full_text");
});

test("lists completed request details for admin", async () => {
  const requests = await listImprovementRequestsForAdmin();
  const request = requests.find((item) => String(item.photo_id) === String(photoId));

  assert.ok(request);
  assert.equal(request.email, `improvement-${testId}@example.test`);

  const detail = await findImprovementRequestForAdmin(request.id);

  assert.equal(detail.filename, `improvement-${testId}.jpg`);
  assert.equal(detail.status, "improved");
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
