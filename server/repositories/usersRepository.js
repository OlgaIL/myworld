import { query, withTransaction } from "../db/index.js";

export async function upsertGoogleUser({ googleId, email, displayName, avatarUrl }) {
  const result = await query(
    `
      insert into users (google_id, email, display_name, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (google_id)
      do update set
        email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now()
      returning *
    `,
    [googleId, email, displayName, avatarUrl]
  );

  return result.rows[0];
}

export async function findUserById(id) {
  const result = await query("select * from users where id = $1", [id]);
  return result.rows[0] || null;
}

export async function findUserByGoogleId(googleId) {
  const result = await query("select * from users where google_id = $1", [googleId]);
  return result.rows[0] || null;
}

export async function listUsersForAdmin() {
  const result = await query(
    `
      select
        users.id,
        users.email,
        users.display_name,
        users.avatar_url,
        users.processing_enabled,
        users.processing_quota,
        users.processing_used,
        users.access_expires_at,
        users.created_at,
        users.updated_at,
        count(photos.id)::int as documents_count,
        max(photos.created_at) as last_document_at
      from users
      left join photos on photos.user_id = users.id
      group by users.id
      order by users.created_at desc
    `
  );

  return result.rows;
}

export async function findUserForAdmin(userId) {
  const result = await query(
    `
      select
        users.id,
        users.email,
        users.display_name,
        users.avatar_url,
        users.processing_enabled,
        users.processing_quota,
        users.processing_used,
        users.access_expires_at,
        users.created_at,
        users.updated_at,
        count(photos.id)::int as documents_count,
        max(photos.created_at) as last_document_at
      from users
      left join photos on photos.user_id = users.id
      where users.id = $1
      group by users.id
      limit 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

export async function updateUserProcessingAccess(userId, { processingEnabled, processingQuota, processingUsed }) {
  const result = await query(
    `
      update users
      set
        processing_enabled = $2,
        processing_quota = $3,
        processing_used = $4,
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, processingEnabled, processingQuota, processingUsed]
  );

  return result.rows[0] || null;
}

export async function updateUserProductAccess(userId, { processingEnabled, processingQuota, processingUsed, accessExpiresAt }) {
  const result = await query(
    `
      update users
      set
        processing_enabled = $2,
        processing_quota = $3,
        processing_used = $4,
        access_expires_at = $5,
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, processingEnabled, processingQuota, processingUsed, accessExpiresAt || null]
  );

  return result.rows[0] || null;
}

export async function consumeProcessingAccess(userId) {
  return withTransaction(async (client) => {
    const result = await client.query("select * from users where id = $1 for update", [userId]);
    const user = result.rows[0] || null;

    if (!user) {
      return null;
    }

    if (user.processing_enabled) {
      return user;
    }

    const quota = Number(user.processing_quota || 0);
    const used = Number(user.processing_used || 0);

    if (used >= quota) {
      return null;
    }

    const updated = await client.query(
      `
        update users
        set
          processing_used = processing_used + 1,
          updated_at = now()
        where id = $1
        returning *
      `,
      [userId]
    );

    return updated.rows[0] || null;
  });
}

export function mapUserForSession(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    googleId: user.google_id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    processingEnabled: Boolean(user.processing_enabled),
    processingQuota: Number(user.processing_quota || 0),
    processingUsed: Number(user.processing_used || 0),
    accessExpiresAt: user.access_expires_at || null
  };
}
