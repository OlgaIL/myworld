import pg from "pg";
import { getPool } from "../db/index.js";

// Separate bounded pool: a network OCR request holds a session lock, never a
// transaction or all connections needed by the ordinary repositories.
let lockPool;
export async function acquireGuestStorageLock(key, { tryOnly = false, maintenance = false } = {}) {
  lockPool ||= new pg.Pool({ ...getPool().options, max: 4 });
  const client = await lockPool.connect();
  const namespace = maintenance ? 731241 : 731240;
  try {
    const result = await client.query(
      `select ${tryOnly ? "pg_try_advisory_lock" : "pg_advisory_lock"}($1::int, hashtext($2)) as locked`,
      [namespace, String(key)]
    );
    if (tryOnly && !result.rows[0].locked) {
      client.release();
      return null;
    }
  } catch (error) {
    client.release(true);
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query("select pg_advisory_unlock($1::int, hashtext($2))", [namespace, String(key)]);
      client.release();
    } catch {
      client.release(true);
    }
  };
}

export async function closeGuestStorageLocks() {
  if (lockPool) await lockPool.end();
  lockPool = null;
}
