import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { closeDatabaseConnection, getPool, isDatabaseConfigured, withTransaction } from "./index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id bigserial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query("select filename from schema_migrations order by filename asc");
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(client, filename) {
  const migrationPath = path.join(migrationsDir, filename);
  const sql = await fs.readFile(migrationPath, "utf8");

  await client.query(sql);
  await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
}

async function runMigrations() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured. Set it in server/.env before running migrations.");
  }

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const applied = [];

  await withTransaction(async (client) => {
    await ensureMigrationsTable(client);
    const completed = await getAppliedMigrations(client);

    for (const file of files) {
      if (completed.has(file)) {
        continue;
      }

      await applyMigration(client, file);
      applied.push(file);
    }
  });

  if (applied.length === 0) {
    console.log("Database is up to date.");
    return;
  }

  console.log("Applied migrations:");
  for (const file of applied) {
    console.log(`- ${file}`);
  }
}

try {
  await getPool();
  await runMigrations();
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await closeDatabaseConnection();
}
