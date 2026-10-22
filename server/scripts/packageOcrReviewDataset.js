import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = await fs.realpath(path.join(root, "outputs/ocr-review-dataset"));
const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.cases) || !manifest.cases.length) throw new Error("Invalid dataset");
const archive = path.resolve(process.argv[2] || path.join(root, "outputs/ocr-review-dataset.tar.gz"));
const members = [`${path.basename(directory)}/manifest.json`];
for (const item of manifest.cases) {
  if (typeof item.image !== "string" || path.isAbsolute(item.image)) throw new Error("Non-portable image path");
  const candidate = path.resolve(directory, item.image);
  const file = await fs.realpath(candidate);
  const relative = path.relative(directory, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)
    || (await fs.lstat(candidate)).isSymbolicLink() || !(await fs.stat(file)).isFile()) throw new Error("Unsafe image path");
  members.push(`${path.basename(directory)}/${path.relative(directory, candidate).replaceAll(path.sep, "/")}`);
}
await fs.mkdir(path.dirname(archive), { recursive: true });
const temporary = `${archive}.${randomUUID()}.tmp`;
execFileSync("tar", ["-czf", temporary, "-C", path.dirname(directory), "--", ...new Set(members)], { stdio: "pipe" });
await fs.rename(temporary, archive);
console.log(JSON.stringify({ archive, revision: manifest.revision || null, cases: manifest.cases.length, files: new Set(members).size }));
