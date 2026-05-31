import { query } from "../db/index.js";

export async function createGuestDocument({
  guestSessionId,
  filename,
  storagePath,
  mimeType,
  sizeBytes,
  status = "uploaded",
  ocrProvider = null,
  expiresAt
}) {
  const result = await query(
    `
      insert into guest_documents (
        guest_session_id,
        filename,
        storage_path,
        mime_type,
        size_bytes,
        status,
        ocr_provider,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning *
    `,
    [guestSessionId, filename, storagePath, mimeType, sizeBytes, status, ocrProvider, expiresAt]
  );

  return result.rows[0] || null;
}

export async function findGuestDocumentById(id) {
  const result = await query("select * from guest_documents where id = $1", [id]);
  return result.rows[0] || null;
}

export async function findLatestGuestDocumentBySessionId(guestSessionId) {
  const result = await query(
    `
      select
        gd.*,
        (p.id is not null) as claimed_photo_exists
      from guest_documents gd
      left join photos p on p.id = gd.claimed_photo_id
      where gd.guest_session_id = $1
      order by gd.created_at desc
      limit 1
    `,
    [guestSessionId]
  );

  return result.rows[0] || null;
}

export async function listGuestDocumentsBySessionId(guestSessionId) {
  const result = await query(
    `
      select
        gd.*,
        (p.id is not null) as claimed_photo_exists
      from guest_documents gd
      left join photos p on p.id = gd.claimed_photo_id
      where gd.guest_session_id = $1
        and gd.expires_at > now()
        and not (gd.status = 'claimed' and p.id is null)
      order by gd.created_at desc
    `,
    [guestSessionId]
  );

  return result.rows;
}

export async function findLatestActiveGuestDocumentBySessionId(guestSessionId) {
  const result = await query(
    `
      select *
      from guest_documents
      where guest_session_id = $1
        and status <> 'claimed'
        and expires_at > now()
      order by created_at desc
      limit 1
    `,
    [guestSessionId]
  );

  return result.rows[0] || null;
}

export async function listActiveGuestDocumentsBySessionId(guestSessionId) {
  const result = await query(
    `
      select *
      from guest_documents
      where guest_session_id = $1
        and status <> 'claimed'
        and expires_at > now()
      order by created_at asc
    `,
    [guestSessionId]
  );

  return result.rows;
}

export async function updateGuestDocumentStatus(id, status, errorMessage = null) {
  const result = await query(
    `
      update guest_documents
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

export async function replaceGuestDocumentUpload(id, {
  filename,
  storagePath,
  mimeType,
  sizeBytes,
  status = "processing",
  ocrProvider = null,
  expiresAt
}) {
  const result = await query(
    `
      update guest_documents
      set
        filename = $2,
        storage_path = $3,
        mime_type = $4,
        size_bytes = $5,
        status = $6,
        ocr_provider = $7,
        ocr_text = '',
        error_message = null,
        ai_provider = null,
        title = '',
        summary = '',
        category = '',
        tags = '[]'::jsonb,
        clean_text = '',
        text_quality = '',
        ai_notes = '',
        processed_at = null,
        expires_at = $8,
        updated_at = now()
      where id = $1
      returning *
    `,
    [id, filename, storagePath, mimeType, sizeBytes, status, ocrProvider, expiresAt]
  );

  return result.rows[0] || null;
}

export async function updateGuestDocumentProcessingResult(id, updates) {
  const {
    status,
    ocrText,
    aiProvider,
    title,
    summary,
    category,
    tags,
    cleanText,
    textQuality,
    aiNotes,
    errorMessage,
    processedAt = null
  } = updates;

  const result = await query(
    `
      update guest_documents
      set
        status = coalesce($2, status),
        ocr_text = coalesce($3, ocr_text),
        ai_provider = coalesce($4, ai_provider),
        title = coalesce($5, title),
        summary = coalesce($6, summary),
        category = coalesce($7, category),
        tags = coalesce($8, tags),
        clean_text = coalesce($9, clean_text),
        text_quality = coalesce($10, text_quality),
        ai_notes = coalesce($11, ai_notes),
        error_message = $12,
        processed_at = $13,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      status,
      ocrText,
      aiProvider,
      title,
      summary,
      category,
      tags ? JSON.stringify(tags) : null,
      cleanText,
      textQuality,
      aiNotes,
      errorMessage,
      processedAt
    ]
  );

  return result.rows[0] || null;
}

export async function markGuestDocumentClaimed(id, claimedPhotoId = null) {
  const result = await query(
    `
      update guest_documents
      set
        status = 'claimed',
        claimed_photo_id = $2,
        claimed_at = now(),
        updated_at = now()
      where id = $1
      returning *
    `,
    [id, claimedPhotoId]
  );

  return result.rows[0] || null;
}
