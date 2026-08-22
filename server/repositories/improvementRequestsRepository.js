import { query, withTransaction } from "../db/index.js";

const ACTIVE_STATUSES = ["submitted", "in_review"];

export async function createImprovementRequest({ userId, photoId, comment = "", consentVersion }) {
  const result = await query(
    `
      insert into recognition_improvement_requests (
        user_id,
        photo_id,
        user_comment,
        manual_review_consent_at,
        consent_version,
        original_ocr_text,
        original_clean_text
      )
      select $1, p.id, $3, now(), $4, p.ocr_text, p.clean_text
      from photos p
      where p.id = $2 and p.user_id = $1
      on conflict (photo_id) where status in ('submitted', 'in_review')
      do nothing
      returning *
    `,
    [userId, photoId, comment, consentVersion]
  );

  if (result.rows[0]) {
    return { request: result.rows[0], created: true };
  }

  const existing = await findActiveImprovementRequestForPhoto({ userId, photoId });
  return { request: existing, created: false };
}

export async function findActiveImprovementRequestForPhoto({ userId, photoId }) {
  const result = await query(
    `
      select *
      from recognition_improvement_requests
      where user_id = $1
        and photo_id = $2
        and status = any($3::text[])
      order by created_at desc
      limit 1
    `,
    [userId, photoId, ACTIVE_STATUSES]
  );

  return result.rows[0] || null;
}

export async function listImprovementRequestsForPhoto({ userId, photoId }) {
  const result = await query(
    `
      select *
      from recognition_improvement_requests
      where user_id = $1 and photo_id = $2
      order by created_at desc
    `,
    [userId, photoId]
  );

  return result.rows;
}

export async function listImprovementRequestsForUser(userId) {
  const result = await query(
    `
      select rir.*, p.filename
      from recognition_improvement_requests rir
      join photos p on p.id = rir.photo_id
      where rir.user_id = $1
      order by rir.created_at desc
    `,
    [userId]
  );

  return result.rows;
}

export async function listImprovementRequestsForAdmin() {
  const result = await query(
    `
      select
        rir.*,
        u.email,
        u.display_name,
        p.filename,
        p.title,
        p.text_quality,
        p.status as photo_status
      from recognition_improvement_requests rir
      join users u on u.id = rir.user_id
      join photos p on p.id = rir.photo_id
      order by
        case rir.status
          when 'submitted' then 0
          when 'in_review' then 1
          else 2
        end,
        rir.created_at asc
    `
  );

  return result.rows;
}

export async function findImprovementRequestForAdmin(id) {
  const result = await query(
    `
      select
        rir.*,
        u.email,
        u.display_name,
        p.filename,
        p.storage_path,
        p.mime_type,
        p.status as photo_status,
        p.ocr_text,
        p.clean_text,
        p.title,
        p.summary,
        p.text_quality,
        p.ai_notes,
        p.created_at as photo_created_at
      from recognition_improvement_requests rir
      join users u on u.id = rir.user_id
      join photos p on p.id = rir.photo_id
      where rir.id = $1
      limit 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function updateImprovementRequestStatusForAdmin(id, status) {
  const result = await query(
    `
      update recognition_improvement_requests
      set
        status = $2,
        started_at = case
          when $2 = 'in_review' then coalesce(started_at, now())
          else started_at
        end,
        completed_at = case
          when $2 in ('improved', 'not_improvable', 'cancelled') then coalesce(completed_at, now())
          else completed_at
        end,
        updated_at = now()
      where id = $1
        and status = 'submitted'
      returning *
    `,
    [id, status]
  );

  return result.rows[0] || null;
}

export async function completeImprovementRequestForAdmin({ id, status, improvedText = "", adminComment = "" }) {
  return withTransaction(async (client) => {
    const requestResult = await client.query(
      `
        select *
        from recognition_improvement_requests
        where id = $1
        for update
      `,
      [id]
    );
    const request = requestResult.rows[0];

    if (!request) {
      return null;
    }

    if (request.status !== "in_review") {
      return { conflict: true, request };
    }

    if (status === "improved") {
      await client.query(
        `
          update photos
          set
            clean_text = $2,
            formatted_content = jsonb_build_object(
              'blocks',
              jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', $2::text))
            ),
            formatted_at = now(),
            text_quality = 'full_text',
            updated_at = now()
          where id = $1
        `,
        [request.photo_id, improvedText]
      );
    }

    const updatedResult = await client.query(
      `
        update recognition_improvement_requests
        set
          status = $2,
          improved_text = $3,
          admin_comment = $4,
          completed_at = now(),
          updated_at = now()
        where id = $1
        returning *
      `,
      [id, status, status === "improved" ? improvedText : "", adminComment]
    );

    return { conflict: false, request: updatedResult.rows[0] };
  });
}
