import { query, withTransaction } from "../db/index.js";

export async function createGuestSession({
  sessionToken,
  documentsUsed = 0,
  ipHash = null,
  userAgentHash = null,
  convertedUserId = null
}) {
  const result = await query(
    `
      insert into guest_sessions (
        session_token,
        documents_used,
        ip_hash,
        user_agent_hash,
        converted_user_id
      )
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [sessionToken, documentsUsed, ipHash, userAgentHash, convertedUserId]
  );

  return result.rows[0] || null;
}

export async function findGuestSessionById(id) {
  const result = await query("select * from guest_sessions where id = $1", [id]);
  return result.rows[0] || null;
}

export async function findGuestSessionByToken(sessionToken) {
  const result = await query("select * from guest_sessions where session_token = $1", [sessionToken]);
  return result.rows[0] || null;
}

export async function touchGuestSession(id) {
  const result = await query(
    `
      update guest_sessions
      set last_seen_at = now()
      where id = $1
      returning *
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function markGuestSessionConverted(id, userId) {
  const result = await query(
    `
      update guest_sessions
      set
        converted_user_id = $2,
        last_seen_at = now()
      where id = $1
      returning *
    `,
    [id, userId]
  );

  return result.rows[0] || null;
}

export async function consumeGuestDocumentSlot(sessionId, documentLimit) {
  return withTransaction(async (client) => {
    const result = await client.query("select * from guest_sessions where id = $1 for update", [sessionId]);
    const session = result.rows[0] || null;

    if (!session) {
      return null;
    }

    const documentsUsed = Number(session.documents_used || 0);

    if (documentsUsed >= documentLimit) {
      return null;
    }

    const updated = await client.query(
      `
        update guest_sessions
        set
          documents_used = documents_used + 1,
          last_seen_at = now()
        where id = $1
        returning *
      `,
      [sessionId]
    );

    return updated.rows[0] || null;
  });
}
