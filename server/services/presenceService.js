import { randomBytes } from "node:crypto";
import { query } from "../db/index.js";

export const PRESENCE_COOKIE_NAME = "word2you_presence";
export const PRESENCE_WINDOW_MS = 2 * 60 * 1000;
const MAX_VISITORS = 10000;
const visitors = new Map();

function prune(now) {
  for (const [id, visitor] of visitors) {
    if (now - visitor.seenAt > PRESENCE_WINDOW_MS) visitors.delete(id);
  }
}

export function recordPresence(cookieValue, userId = null, now = Date.now()) {
  prune(now);
  const id = /^[a-f0-9]{32}$/.test(cookieValue || "")
    ? cookieValue
    : randomBytes(16).toString("hex");
  if (!visitors.has(id) && visitors.size >= MAX_VISITORS) {
    return { id, recorded: false };
  }
  visitors.set(id, { userId: userId || null, seenAt: now });
  return { id, recorded: true };
}

export function getPresenceSnapshot(now = Date.now()) {
  prune(now);
  const userIds = new Set();
  for (const visitor of visitors.values()) {
    if (visitor.userId) userIds.add(String(visitor.userId));
  }
  return { total: visitors.size, authenticated: userIds.size, userIds: [...userIds] };
}

export async function countPaidActiveUsers(userIds, runQuery = query) {
  const ids = userIds.filter((id) => /^\d+$/.test(String(id)));
  if (ids.length === 0) return 0;

  const result = await runQuery(
    `select count(*)::int as paid
       from users
      where id = any($1::bigint[])
        and processing_quota > processing_used
        and exists (
          select 1 from payments
           where payments.user_id = users.id and payments.status = 'succeeded'
        )`,
    [ids]
  );
  return Number(result.rows[0].paid);
}

export function clearPresenceForTests() {
  visitors.clear();
}
