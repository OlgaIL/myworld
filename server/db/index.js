import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_SSL = process.env.DATABASE_SSL === "true";

let pool = null;

function buildPoolConfig() {
  if (!DATABASE_URL) {
    return null;
  }

  return {
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false
  };
}

export function isDatabaseConfigured() {
  return Boolean(DATABASE_URL);
}

export function getPool() {
  if (!pool) {
    const config = buildPoolConfig();

    if (!config) {
      throw new Error("DATABASE_URL is not configured");
    }

    pool = new Pool(config);
  }

  return pool;
}

export async function query(text, params = []) {
  const activePool = getPool();
  return activePool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection() {
  const result = await query("select now() as current_time");
  return result.rows[0];
}

export async function closeDatabaseConnection() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
