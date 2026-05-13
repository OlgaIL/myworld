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

export async function updateGuestDocumentProcessingResult(id, updates) {
  const {
    status,
    ocrText,
    errorMessage,
    processedAt = null
  } = updates;

  const result = await query(
    `
      update guest_documents
      set
        status = coalesce($2, status),
        ocr_text = coalesce($3, ocr_text),
        error_message = $4,
        processed_at = $5,
        updated_at = now()
      where id = $1
      returning *
    `,
    [id, status, ocrText, errorMessage, processedAt]
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
