import { query, withTransaction } from "../db/index.js";
import { USER_RECORD_LIMIT } from "../config/env.js";

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

export async function upsertYandexUser({ yandexId, email, displayName, avatarUrl }) {
  const existingByYandex = await query("select * from users where yandex_id = $1", [yandexId]);

  if (existingByYandex.rows[0]) {
    const result = await query(
      `
        update users
        set
          email = $2,
          display_name = $3,
          avatar_url = $4,
          updated_at = now()
        where yandex_id = $1
        returning *
      `,
      [yandexId, email, displayName, avatarUrl]
    );

    return result.rows[0];
  }

  if (email) {
    const existingByEmail = await query(
      `
        select *
        from users
        where lower(email) = lower($1)
        order by created_at asc
        limit 1
      `,
      [email]
    );

    if (existingByEmail.rows[0] && !existingByEmail.rows[0].yandex_id) {
      const result = await query(
        `
          update users
          set
            yandex_id = $2,
            display_name = $3,
            avatar_url = coalesce($4, avatar_url),
            updated_at = now()
          where id = $1
          returning *
        `,
        [existingByEmail.rows[0].id, yandexId, displayName, avatarUrl]
      );

      return result.rows[0];
    }
  }

  const result = await query(
    `
      insert into users (yandex_id, email, display_name, avatar_url)
      values ($1, $2, $3, $4)
      returning *
    `,
    [yandexId, email, displayName, avatarUrl]
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
        users.records_processed_total,
        users.processing_mode,
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
        users.records_processed_total,
        users.processing_mode,
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

export async function incrementUserRecordsProcessedTotal(userId) {
  const result = await query(
    `
      update users
      set
        records_processed_total = records_processed_total + 1,
        processing_used = case
          when
            processing_enabled = false
            and (access_expires_at is null or access_expires_at <= now())
            and records_processed_total >= $2
            and processing_used < processing_quota
          then processing_used + 1
          else processing_used
        end,
        updated_at = now()
      where id = $1
      returning *
    `,
    [userId, USER_RECORD_LIMIT]
  );

  return result.rows[0] || null;
}

export function mapUserForSession(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    googleId: user.google_id,
    yandexId: user.yandex_id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    processingEnabled: Boolean(user.processing_enabled),
    processingQuota: Number(user.processing_quota || 0),
    processingUsed: Number(user.processing_used || 0),
    recordsProcessedTotal: Number(user.records_processed_total || 0),
    processingMode: user.processing_mode || null,
    accessExpiresAt: user.access_expires_at || null
  };
}
