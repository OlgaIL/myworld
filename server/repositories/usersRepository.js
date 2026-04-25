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
    processingUsed: Number(user.processing_used || 0)
  };
}
