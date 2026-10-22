import { query, withTransaction } from "../db/index.js";

export function validateGift({ amount, note, requestId } = {}) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 10000
    || typeof note !== "string" || !note.trim() || note.trim().length > 500
    || typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw Object.assign(new Error("INVALID_GIFT"), { status: 400 });
  }
  return { amount, note: note.trim(), requestId: requestId.toLowerCase() };
}

export async function grantGiftProcessing(userId, input, createdBy) {
  const { amount, note, requestId } = validateGift(input);
  return withTransaction(async client => {
    const user = (await client.query("select id from users where id = $1 for update", [userId])).rows[0];
    if (!user) throw Object.assign(new Error("USER_NOT_FOUND"), { status: 404 });
    const previous = (await client.query("select * from gift_processing_events where id = $1", [requestId])).rows[0];
    if (previous) {
      if (String(previous.user_id) !== String(userId) || previous.amount !== amount || previous.note !== note) {
        throw Object.assign(new Error("GIFT_REQUEST_CONFLICT"), { status: 409 });
      }
      return previous;
    }
    const event = (await client.query(`insert into gift_processing_events(id,user_id,amount,note,created_by)
      values ($1,$2,$3,$4,$5) returning *`, [requestId, userId, amount, note, createdBy])).rows[0];
    await client.query(`update users set gift_processing_quota = gift_processing_quota + $2,
      updated_at = now() where id = $1`, [userId, amount]);
    return event;
  });
}

export async function listGiftProcessing(userId) {
  return (await query("select * from gift_processing_events where user_id = $1 order by created_at desc, id desc", [userId])).rows;
}

export async function listGiftCreditEvents(userId = null) {
  return (await query(`select 'gift:' || g.id::text as id, g.user_id, 'gift' as source,
    'Подарочные обработки' as package_title, g.amount, g.note, g.created_by, g.created_at,
    u.email, u.display_name from gift_processing_events g join users u on u.id = g.user_id
    ${userId === null ? "" : "where g.user_id = $1"}
    order by g.created_at desc, g.id desc ${userId === null ? "limit 200" : ""}`, userId === null ? [] : [userId])).rows;
}
