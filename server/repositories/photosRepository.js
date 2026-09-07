import { query, withTransaction } from "../db/index.js";
import { incrementUserRecordsProcessedTotalWithClient } from "./usersRepository.js";
import { getEffectiveTextContent, getStoredTextCorrections } from "../utils/textCorrections.js";

export async function createPhoto({
  userId,
  filename,
  storagePath,
  mimeType,
  sizeBytes,
  status = "uploaded",
  ocrProvider = null,
  aiProvider = null,
  ocrText = "",
  title = "",
  summary = "",
  category = "",
  section = "",
  topic = "",
  tags = [],
  cleanText = "",
  formattedContent = { blocks: [] },
  formattedAt = null,
  hasTable = false,
  hasFormulas = false,
  hasRecognitionErrors = false,
  textQuality = "",
  aiNotes = "",
  errorMessage = null,
  processedAt = null,
  corrections = []
}) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
      insert into photos (
        user_id,
        filename,
        storage_path,
        mime_type,
        size_bytes,
        status,
        ocr_provider,
        ai_provider,
        ocr_text,
        title,
        summary,
        category,
        section,
        topic,
        tags,
        clean_text,
        formatted_content,
        formatted_at,
        has_table,
        has_formulas,
        has_recognition_errors,
        text_quality,
        ai_notes,
        error_message,
        processed_at,
        corrections
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      returning *
      `,
      [
        userId,
        filename,
        storagePath,
        mimeType,
        sizeBytes,
        status,
        ocrProvider,
        aiProvider,
        ocrText,
        title,
        summary,
        category,
        section,
        topic,
        JSON.stringify(Array.isArray(tags) ? tags : []),
        cleanText,
        JSON.stringify(formattedContent || { blocks: [] }),
        formattedAt,
        Boolean(hasTable),
        Boolean(hasFormulas),
        Boolean(hasRecognitionErrors),
        textQuality,
        aiNotes,
        errorMessage,
        processedAt,
        JSON.stringify(Array.isArray(corrections) ? corrections : [])
      ]
    );

    await client.query(
      `
        update users
        set documents_created_total = documents_created_total + 1, updated_at = now()
        where id = $1
      `,
      [userId]
    );

    return result.rows[0] || null;
  });
}

export async function listPhotosByUser(userId) {
  const result = await query(
    `
      select *
      from photos
      where user_id = $1
      order by created_at desc
    `,
    [userId]
  );

  return result.rows;
}

export async function countPhotosByUser(userId) {
  const result = await query("select count(*)::int as count from photos where user_id = $1", [userId]);
  return Number(result.rows[0]?.count || 0);
}

export async function findPhotoById(id) {
  const result = await query("select * from photos where id = $1", [id]);
  return result.rows[0] || null;
}

export async function findPhotoByFilenameAndUser(filename, userId) {
  const result = await query(
    `
      select *
      from photos
      where filename = $1 and user_id = $2
      limit 1
    `,
    [filename, userId]
  );

  return result.rows[0] || null;
}

export async function updatePhotoStatus(id, status, errorMessage = null) {
  const result = await query(
    `
      update photos
      set
        status = $2,
        error_message = $3,
        updated_at = now()
      where id = $1
      returning *
    `,
    [id, status, errorMessage]
  );

  return result.rows[0] || null;
}

async function updatePhotoProcessingResultWithExecutor(execute, id, updates) {
  const {
    status,
    ocrText,
    title,
    summary,
    category,
    section,
    topic,
    tags,
    cleanText,
    formattedContent,
    formattedAt,
    hasTable,
    hasFormulas,
    hasRecognitionErrors,
    textQuality,
    aiNotes,
    errorMessage,
    processedAt = null,
    corrections
  } = updates;

  const result = await execute(
    `
      update photos
      set
        status = coalesce($2, status),
        ocr_text = coalesce($3, ocr_text),
        title = coalesce($4, title),
        summary = coalesce($5, summary),
        category = coalesce($6, category),
        section = coalesce($7, section),
        topic = coalesce($8, topic),
        tags = coalesce($9, tags),
        clean_text = coalesce($10, clean_text),
        formatted_content = coalesce($11, formatted_content),
        formatted_at = case when $11 is not null then coalesce($12, now()) else formatted_at end,
        has_table = coalesce($13, has_table),
        has_formulas = coalesce($14, has_formulas),
        has_recognition_errors = coalesce($15, has_recognition_errors),
        text_quality = coalesce($16, text_quality),
        ai_notes = coalesce($17, ai_notes),
        error_message = $18,
        processed_at = $19,
        corrections = coalesce($20, corrections),
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      status,
      ocrText,
      title,
      summary,
      category,
      section,
      topic,
      tags ? JSON.stringify(tags) : null,
      cleanText,
      formattedContent ? JSON.stringify(formattedContent) : null,
      formattedAt,
      typeof hasTable === "boolean" ? hasTable : null,
      typeof hasFormulas === "boolean" ? hasFormulas : null,
      typeof hasRecognitionErrors === "boolean" ? hasRecognitionErrors : null,
      textQuality,
      aiNotes,
      errorMessage,
      processedAt,
      Array.isArray(corrections) ? JSON.stringify(corrections) : null
    ]
  );

  return result.rows[0] || null;
}

export async function updatePhotoProcessingResult(id, updates) {
  return updatePhotoProcessingResultWithExecutor(query, id, updates);
}

export async function updatePhotoProcessingResultAndRecordSuccess({ id, userId, updates }) {
  return withTransaction(async (client) => {
    const photo = await updatePhotoProcessingResultWithExecutor(
      (text, params) => client.query(text, params),
      id,
      updates
    );

    if (!photo) {
      return null;
    }

    await incrementUserRecordsProcessedTotalWithClient(client, userId);
    return photo;
  });
}

export async function updatePhotoCorrectionState(id, correctionId, applied) {
  return withTransaction(async (client) => {
    const currentResult = await client.query(
      "select * from photos where id = $1 for update",
      [id]
    );
    const photo = currentResult.rows[0] || null;

    if (!photo) {
      return null;
    }

    const corrections = getStoredTextCorrections(photo.corrections);
    const correction = corrections.find((item) => item.id === correctionId);

    if (!correction) {
      return null;
    }

    const nextCorrections = corrections.map((item) => (
      item.id === correctionId ? { ...item, applied } : item
    ));
    const effective = getEffectiveTextContent(photo.formatted_content, nextCorrections);
    const result = await client.query(
      `
        update photos
        set
          corrections = $2,
          clean_text = $3,
          updated_at = now()
        where id = $1
        returning *
      `,
      [
        id,
        JSON.stringify(nextCorrections),
        effective.cleanText || photo.clean_text || ""
      ]
    );

    return result.rows[0] || null;
  });
}

export async function deletePhoto(id) {
  return withTransaction(async (client) => {
    const result = await client.query("delete from photos where id = $1 returning *", [id]);
    const deleted = result.rows[0] || null;

    if (deleted) {
      await client.query(
        `
          update users
          set documents_deleted_total = documents_deleted_total + 1, updated_at = now()
          where id = $1
        `,
        [deleted.user_id]
      );
    }

    return deleted;
  });
}
