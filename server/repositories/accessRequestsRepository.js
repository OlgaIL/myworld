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
