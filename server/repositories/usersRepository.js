import { query } from "../db/index.js";

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

export function mapUserForSession(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    googleId: user.google_id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url
  };
}
