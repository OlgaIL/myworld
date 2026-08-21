import { query } from "../db/index.js";

const ACTIVE_STATUSES = ["submitted", "in_review"];

export async function createImprovementRequest({ userId, photoId, comment = "", consentVersion }) {
  const result = await query(
    `
      insert into recognition_improvement_requests (
        user_id,
        photo_id,
        user_comment,
        manual_review_consent_at,
        consent_version
      )
      values ($1, $2, $3, now(), $4)
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
