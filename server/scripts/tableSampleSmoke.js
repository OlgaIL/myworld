import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import "../config/load-env.js";
import { userUploadsDir } from "../config/paths.js";
import { extractDocumentTables } from "../services/documentTableService.js";

const argument = process.argv.find((item) => item.startsWith("--image="));
if (!process.argv.includes("--live") || !argument) {
  console.error("Usage: node scripts/tableSampleSmoke.js --live --image=<local-jpg>");
  process.exitCode = 2;
} else {
  const source = path.resolve(argument.slice(8));
  const temporary = path.join(userUploadsDir, `table-smoke-${crypto.randomUUID()}.jpg`);
  await fs.mkdir(userUploadsDir, { recursive: true });
  try {
    await fs.copyFile(source, temporary);
    const result = await extractDocumentTables({ storage_path: temporary, mime_type: "image/jpeg", ocr_text: "" });
    console.log(JSON.stringify({ status: result.status, code: result.code,
      tables: result.content?.blocks.filter((block) => block.type === "table")
        .map((block) => ({ columns: block.headers.length, rows: block.rows.length,
          headers: block.headers, firstRow: block.rows[0] })) || [] }));
    if (result.status !== "ready") process.exitCode = 1;
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
