import { query } from "../db/index.js";

export async function createPhoto({
  userId,
  filename,
  storagePath,
  mimeType,
  sizeBytes,
  status = "uploaded",
  ocrProvider = null,
  aiProvider = null
}) {
  const result = await query(
    `
      insert into photos (
        user_id,
        filename,
        storage_path,
        mime_type,
        size_bytes,
        status,
        ocr_provider,
        ai_provider
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning *
    `,
    [userId, filename, storagePath, mimeType, sizeBytes, status, ocrProvider, aiProvider]
  );

  return result.rows[0];
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

export async function updatePhotoProcessingResult(id, updates) {
  const {
    status,
    ocrText,
    title,
    summary,
    tags,
    errorMessage,
    processedAt = null
  } = updates;

  const result = await query(
    `
      update photos
      set
        status = coalesce($2, status),
        ocr_text = coalesce($3, ocr_text),
        title = coalesce($4, title),
        summary = coalesce($5, summary),
        tags = coalesce($6, tags),
        error_message = $7,
        processed_at = $8,
        updated_at = now()
      where id = $1
      returning *
    `,
    [id, status, ocrText, title, summary, tags ? JSON.stringify(tags) : null, errorMessage, processedAt]
  );

  return result.rows[0] || null;
}

export async function deletePhoto(id) {
  const result = await query("delete from photos where id = $1 returning *", [id]);
  return result.rows[0] || null;
}
