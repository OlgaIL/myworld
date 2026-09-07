import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import { createGuestDocument, updateGuestDocumentProcessingResult } from "../repositories/guestDocumentsRepository.js";
import {
  createPhoto,
  updatePhotoCorrectionState,
  updatePhotoProcessingResult
} from "../repositories/photosRepository.js";

const testId = crypto.randomUUID();
let userId;
let photoId;
let guestSessionId;

before(async () => {
  const columns = await query(`
    select column_name
    from information_schema.columns
    where table_name = 'photos'
      and column_name in ('formatted_content', 'formatted_at', 'has_table', 'has_formulas', 'has_recognition_errors', 'corrections')
  `);
  assert.equal(columns.rows.length, 6, "Run db:migrate before document content tests");

  const user = await query(
    "insert into users (email, display_name) values ($1, $2) returning id",
    [`document-content-${testId}@example.test`, "Document content test"]
  );
  userId = user.rows[0].id;

  const guestSession = await query(
    "insert into guest_sessions (session_token) values ($1) returning id",
    [`document-content-${testId}`]
  );
  guestSessionId = guestSession.rows[0].id;
});

after(async () => {
  if (userId) {
    await query("delete from users where id = $1", [userId]);
  }
  if (guestSessionId) {
    await query("delete from guest_sessions where id = $1", [guestSessionId]);
  }
  await closeDatabaseConnection();
});

test("stores the same structured result for a guest document", async () => {
  const guestDocument = await createGuestDocument({
    guestSessionId,
    filename: `guest-content-${testId}.jpg`,
    storagePath: `test/guest-${testId}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 100,
    expiresAt: new Date(Date.now() + 60_000)
  });

  const updated = await updateGuestDocumentProcessingResult(guestDocument.id, {
    status: "processed",
    cleanText: "Строка таблицы",
    formattedContent: {
      blocks: [{ type: "paragraph", text: "Строка таблицы" }]
    },
    hasTable: true,
    hasFormulas: false,
    hasRecognitionErrors: true,
    processedAt: new Date()
  });

  assert.deepEqual(updated.formatted_content, {
    blocks: [{ type: "paragraph", text: "Строка таблицы" }]
  });
  assert.ok(updated.formatted_at);
  assert.equal(updated.has_table, true);
  assert.equal(updated.has_formulas, false);
  assert.equal(updated.has_recognition_errors, true);
});

test("stores formatted content and content feature flags with the processing result", async () => {
  const created = await createPhoto({
    userId,
    filename: `document-content-${testId}.jpg`,
    storagePath: `test/${testId}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 100
  });
  photoId = created.id;

  const updated = await updatePhotoProcessingResult(photoId, {
    status: "processed",
    cleanText: "Заголовок\n\n- Первый пункт",
    formattedContent: {
      blocks: [
        { type: "heading", text: "Заголовок" },
        { type: "list", items: ["Первый пункт"] }
      ]
    },
    hasTable: true,
    hasFormulas: false,
    hasRecognitionErrors: true,
    corrections: [{
      id: "correction-1",
      original: "Первыи",
      replacement: "Первый",
      blockIndex: 1,
      itemIndex: 0,
      start: 0,
      end: 6,
      applied: true
    }],
    processedAt: new Date()
  });

  assert.deepEqual(updated.formatted_content, {
    blocks: [
      { type: "heading", text: "Заголовок" },
      { type: "list", items: ["Первый пункт"] }
    ]
  });
  assert.ok(updated.formatted_at);
  assert.equal(updated.has_table, true);
  assert.equal(updated.has_formulas, false);
  assert.equal(updated.has_recognition_errors, true);

  const reverted = await updatePhotoCorrectionState(photoId, "correction-1", false);
  assert.equal(reverted.clean_text, "Заголовок\n\n- Первыи пункт");
  assert.equal(reverted.corrections[0].applied, false);
  assert.deepEqual(reverted.formatted_content, updated.formatted_content);

  const reapplied = await updatePhotoCorrectionState(photoId, "correction-1", true);
  assert.equal(reapplied.clean_text, "Заголовок\n\n- Первый пункт");
  assert.equal(reapplied.corrections[0].applied, true);
});
