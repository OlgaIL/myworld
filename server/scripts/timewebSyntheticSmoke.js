import fs from "node:fs/promises";
import dotenv from "dotenv";
import { readTimewebConfig } from "../config/timeweb.js";
import { processTimeweb } from "../services/timewebAiService.js";

// No DB import and no document input. A human must opt in to the one paid request.
if (!process.argv.includes("--live")) {
  console.error("Explicit opt-in required: node scripts/timewebSyntheticSmoke.js --live [--report=path.json]");
  process.exitCode = 2;
} else {
  dotenv.config({ quiet: true });
  const config = readTimewebConfig();
  const startedAt = Date.now();
  const result = await processTimeweb("Синтетическая учебная запись. План: купить две тетради, прочитать главу о воде, повторить материал.", {
    timeweb: config, logger: { info() {}, error() {} }
  });
  const report = {
    synthetic: true, provider: "timeweb", model: config.model, success: !result.error,
    durationMs: Date.now() - startedAt, errorCode: result.errorCode || null,
    failureKind: result.failureKind || null, attempts: result.attempts ?? 1,
    usage: result.usage || {}, blockCount: result.formattedContent?.blocks?.length || 0
  };
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
  if (reportPath) await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (result.error) process.exitCode = 1;
}
