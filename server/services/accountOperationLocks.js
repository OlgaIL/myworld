import pg from "pg";
import { getPool, query } from "../db/index.js";

const NAMESPACE = 731242;
let lockPool;

// Session locks cover upload/OCR/claim without keeping network work in a DB
// transaction. Shared operations coexist; deletion needs an exclusive lock.
export async function acquireAccountOperationLock(userId, { exclusive = false } = {}) {
  lockPool ||= new pg.Pool({ ...getPool().options, max: 20, connectionTimeoutMillis: 2000, allowExitOnIdle: true });
  const client = await lockPool.connect();
  const suffix = exclusive ? "" : "_shared";
  try {
    const result = await client.query(`select pg_try_advisory_lock${suffix}($1::int, hashtext($2)) as locked`, [NAMESPACE, String(userId)]);
    if (!result.rows[0].locked) { client.release(); return null; }
  } catch (error) { client.release(true); throw error; }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query(`select pg_advisory_unlock${suffix}($1::int, hashtext($2))`, [NAMESPACE, String(userId)]);
      client.release();
    } catch { client.release(true); }
  };
}

export function withAccountOperation(handler) {
  return async (req, res, next) => {
    let release;
    try {
      release = await acquireAccountOperationLock(req.user.id);
      if (!release) return res.status(409).json({ error: "ACCOUNT_BUSY" });
      const current = await query("select id from users where id = $1", [req.user.id]);
      if (!current.rows.length) return res.status(401).json({ error: "UNAUTHORIZED" });
      // Release on handler completion, not socket close: disconnected OCR can
      // still be running and must remain protected until its work finishes.
      return await handler(req, res, next);
    } catch (error) { return next(error); }
    finally { if (release) await release(); }
  };
}

export async function closeAccountOperationLocks() {
  if (lockPool) await lockPool.end();
  lockPool = null;
}
