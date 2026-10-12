import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
const parsed = dotenv.parse(await fs.readFile(".env", "utf8").catch((error) => { if (error.code !== "ENOENT") throw error; return ""; }));
const url = new URL(process.env.DATABASE_URL || parsed.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("LOCAL_DATABASE_REQUIRED");
const suites = [["tests/guestStatistics.test.js", "standard"], ["tests/guestStatistics.test.js", "fast"]];
if (process.argv.includes("--regressions")) suites.push(["tests/guestStorage.test.js"], ["tests/adminAccountDeletion.test.js"]);
for (const [suite, pipeline] of suites) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "myworld-guest-test-"));
  const uploads = path.join(temporary, "uploads");
  await fs.mkdir(path.join(uploads, "guests"), { recursive: true });
  await fs.mkdir(path.join(uploads, "users"), { recursive: true });
  try {
    const cleared = Object.fromEntries([...Object.keys(parsed), ...Object.keys(process.env).filter((key) => /API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS/.test(key))].map((key) => [key, ""]));
    const env = { ...process.env, ...cleared, DATABASE_URL: url.toString(), DATABASE_SSL: "false", NODE_ENV: "test", MYWORLD_TEST_UPLOADS_DIR: uploads,
      GUEST_STATS_TEST_PIPELINE: pipeline || "", GOOGLE_CLOUD_PROJECT: "synthetic", GCE_METADATA_HOST: "127.0.0.1:9",
      OPENAI_API_KEY: "", YANDEX_API_KEY: "", TIMEWEB_API_KEY: "", TELEGRAM_BOT_TOKEN: "", SMTP_PASSWORD: "",
      GOOGLE_APPLICATION_CREDENTIALS: "", YOOKASSA_SECRET_KEY: "", YANDEX_METRIKA_API_ENABLED: "false" };
    const result = spawnSync(process.execPath, ["--import", "./tests/guestStatisticsSyntheticEnv.js", "--test", suite], { env, stdio: "inherit" });
    if (result.error || result.status !== 0) { process.exitCode = 1; break; }
  } finally {
    const resolved = path.resolve(temporary);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("myworld-guest-test-")) throw new Error("UNSAFE_TEST_ROOT");
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
