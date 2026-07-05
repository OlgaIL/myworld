import { query } from "../db/index.js";

export async function createAccessRequest({ userId, email, message = "" }) {
  const result = await query(
    `
      insert into access_requests (user_id, email, message)
      values ($1, $2, $3)
      returning *
    `,
    [userId, email, message]
  );

  return result.rows[0];
}

export async function listAccessRequestsForUser(userId) {
  const result = await query(
    `
      select *
      from access_requests
      where user_id = $1
      order by created_at desc
    `,
    [userId]
  );

  return result.rows;
}

export async function listAccessRequestsForAdmin() {
  const result = await query(`
    select
      ar.*,
      u.display_name,
      u.avatar_url,
      count(p.id)::int as documents_count
    from access_requests ar
    left join users u on u.id = ar.user_id
    left join photos p on p.user_id = ar.user_id
    group by ar.id, u.display_name, u.avatar_url
    order by
      case when ar.status = 'new' then 0 else 1 end,
      ar.created_at desc
  `);

  return result.rows;
}

export async function updateAccessRequestStatus(id, status) {
  const result = await query(
    `
      update access_requests
      set
        status = $2,
        updated_at = now()
      where id = $1
      returning *
    `,
    [id, status]
  );

  return result.rows[0] || null;
}
