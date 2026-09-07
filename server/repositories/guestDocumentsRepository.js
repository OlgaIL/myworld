import { query, withTransaction } from "../db/index.js";
import { getEffectiveTextContent, getStoredTextCorrections } from "../utils/textCorrections.js";

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
        (p.id is not null) as claimed_photo_exists,
        rir.id as improvement_request_id,
        rir.status as improvement_request_status,
        rir.created_at as improvement_request_created_at,
        rir.updated_at as improvement_request_updated_at
      from guest_documents gd
      left join photos p on p.id = gd.claimed_photo_id
      left join lateral (
        select id, status, created_at, updated_at
        from recognition_improvement_requests
        where photo_id = gd.claimed_photo_id
        order by created_at desc
        limit 1
      ) rir on true
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
        section = '',
        topic = '',
        tags = '[]'::jsonb,
        clean_text = '',
        formatted_content = '{}'::jsonb,
        formatted_at = null,
        has_table = false,
        has_formulas = false,
        has_recognition_errors = false,
        corrections = '[]'::jsonb,
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
        section = coalesce($8, section),
        topic = coalesce($9, topic),
        tags = coalesce($10, tags),
        clean_text = coalesce($11, clean_text),
        formatted_content = coalesce($12, formatted_content),
        formatted_at = case when $12 is not null then coalesce($13, now()) else formatted_at end,
        has_table = coalesce($14, has_table),
        has_formulas = coalesce($15, has_formulas),
        has_recognition_errors = coalesce($16, has_recognition_errors),
        text_quality = coalesce($17, text_quality),
        ai_notes = coalesce($18, ai_notes),
        error_message = $19,
        processed_at = $20,
        corrections = coalesce($21, corrections),
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

export async function updateGuestDocumentCorrectionState(id, correctionId, applied) {
  return withTransaction(async (client) => {
    const currentResult = await client.query(
      "select * from guest_documents where id = $1 for update",
      [id]
    );
    const document = currentResult.rows[0] || null;

    if (!document) {
      return null;
    }

    const corrections = getStoredTextCorrections(document.corrections);
    const correction = corrections.find((item) => item.id === correctionId);

    if (!correction) {
      return null;
    }

    const nextCorrections = corrections.map((item) => (
      item.id === correctionId ? { ...item, applied } : item
    ));
    const effective = getEffectiveTextContent(document.formatted_content, nextCorrections);
    const result = await client.query(
      `
        update guest_documents
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
        effective.cleanText || document.clean_text || ""
      ]
    );

    return result.rows[0] || null;
  });
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
