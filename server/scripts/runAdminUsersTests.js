import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

const serverDir = fileURLToPath(new URL("../", import.meta.url));
const config = dotenv.parse(await fs.readFile(path.join(serverDir, ".env")));
const url = new URL(config.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw Error("LOCAL_DATABASE_REQUIRED");
const schema = `admin_users_suite_${crypto.randomUUID().replaceAll("-", "")}`;
const bootstrap = new pg.Pool({ connectionString: url.toString() });
let pool;
try {
  await bootstrap.query(`create schema ${schema}`);
  url.searchParams.set("options", `-c search_path=${schema}`);
  pool = new pg.Pool({ connectionString: url.toString() });
  for (const file of (await fs.readdir(path.join(serverDir, "db/migrations"))).filter(name => name.endsWith(".sql")).sort()) {
    await pool.query(await fs.readFile(path.join(serverDir, "db/migrations", file), "utf8"));
  }
  const env = { ...process.env, NODE_ENV: "test", DATABASE_URL: url.toString(),
    MYWORLD_TEST_UPLOADS_DIR: path.resolve(serverDir, "../work", schema),
    ADMIN_ENABLED: "true", ADMIN_LOGIN: "synthetic", ADMIN_PASSWORD: "synthetic", PROCESSING_ENABLED: "false",
    YANDEX_METRIKA_API_ENABLED: "false", YANDEX_METRIKA_VISITS_START_DATE: "2026-01-01",
    DOTENV_CONFIG_QUIET: "true", GOOGLE_CLOUD_PROJECT: "synthetic-tests", METADATA_SERVER_DETECTION: "none" };
  for (const key of ["OPENAI_API_KEY", "YANDEX_API_KEY", "YANDEX_FOLDER_ID", "TIMEWEB_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLIENT_SECRET", "YANDEX_CLIENT_SECRET", "VK_CLIENT_SECRET", "SBER_CLIENT_SECRET", "MTS_CLIENT_SECRET",
    "YOOKASSA_SECRET_KEY", "SMTP_PASSWORD", "TELEGRAM_BOT_TOKEN", "YANDEX_METRIKA_API_TOKEN"]) env[key] = "";
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import=data:text/javascript,globalThis.__myworldEnvLoaded=true", "--test", "--test-concurrency=1",
      "tests/adminUsersDirectory.test.js", "tests/adminUserAnalyticsRoutes.test.js", "tests/adminAccountDeletion.test.js",
      "tests/processingAccess.test.js", "tests/giftProcessing.test.js"], {
      cwd: serverDir, env, windowsHide: true, stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  if (pool) await pool.end();
  await bootstrap.query(`drop schema if exists ${schema} cascade`);
  await bootstrap.end();
}
