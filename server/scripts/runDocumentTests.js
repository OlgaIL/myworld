import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const serverDir = fileURLToPath(new URL("../", import.meta.url));
const config = dotenv.parse(await fs.readFile(path.join(serverDir, ".env")));
const url = new URL(config.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw Error("LOCAL_DATABASE_REQUIRED");
const schema = `multipage_suite_${crypto.randomBytes(10).toString("hex")}`;
const uploads = await fs.mkdtemp(path.join(os.tmpdir(), "myworld-document-suite-"));
const admin = new pg.Client({ connectionString: url.href });
let pool;
try {
  await admin.connect(); await admin.query(`create schema ${schema}`);
  url.searchParams.set("options", `-c search_path=${schema}`);
  pool = new pg.Pool({ connectionString: url.href });
  for (const name of (await fs.readdir(path.join(serverDir,"db/migrations"))).filter(n=>n.endsWith(".sql")).sort()) {
    await pool.query(await fs.readFile(path.join(serverDir,"db/migrations",name),"utf8"));
  }
  const env = { ...process.env, DATABASE_URL: url.href, DATABASE_SSL: "false", NODE_ENV: "test",
    MYWORLD_TEST_UPLOADS_DIR: uploads, PROCESSING_ENABLED: "false", GOOGLE_CLOUD_PROJECT: "synthetic-tests",
    METADATA_SERVER_DETECTION: "none", GCE_METADATA_HOST: "127.0.0.1:9", DOTENV_CONFIG_QUIET: "true",
    ADMIN_ENABLED: "true", ADMIN_LOGIN: "synthetic", ADMIN_PASSWORD: "synthetic" };
  for (const key of ["OPENAI_API_KEY", "YANDEX_API_KEY", "YANDEX_FOLDER_ID", "TIMEWEB_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLIENT_SECRET", "YANDEX_CLIENT_SECRET", "VK_CLIENT_SECRET",
    "SBER_CLIENT_SECRET", "MTS_CLIENT_SECRET", "YOOKASSA_SECRET_KEY", "SMTP_PASSWORD", "TELEGRAM_BOT_TOKEN",
    "YANDEX_METRIKA_API_TOKEN"]) env[key] = "";
  const tests = ["multipageDocuments", "photoDeletion", "guestStorage", "documentTableRoute", "documentDisplayTitles",
    "documentContentRepository", "improvementRequestsRepository", "improvementRequestRoutes",
    "adminImprovementRequestsRoutes", "userAnalyticsRepository"].map(n => `tests/${n}.test.js`);
  const code = await new Promise((resolve,reject) => {
    const child = spawn(process.execPath,["--import=data:text/javascript,globalThis.__myworldEnvLoaded=true",
      "--test","--test-concurrency=1",...tests],{cwd:serverDir,env,windowsHide:true,stdio:"inherit"});
    child.on("error",reject);child.on("exit",resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  if(pool)await pool.end();
  if(admin._connected) {await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();}
  if(path.dirname(uploads)!==os.tmpdir()||!path.basename(uploads).startsWith("myworld-document-suite-"))throw Error("UNSAFE_TEST_CLEANUP");
  await fs.rm(uploads,{recursive:true,force:true});
}
