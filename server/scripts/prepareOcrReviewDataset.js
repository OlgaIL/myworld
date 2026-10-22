import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.resolve(process.argv[2] || path.join(root, "outputs/ocr-regression/private-local-cases.json"));
const target = path.join(root, "outputs/ocr-review-dataset");
const manifest = JSON.parse(await fs.readFile(source, "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.cases)) throw new Error("Invalid source manifest");
await fs.mkdir(path.join(target, "images"), { recursive: true });
const cases = [];
for (const item of manifest.cases) {
  if (!/^[\w-]{1,80}$/u.test(String(item.id))) throw new Error("Invalid case ID");
  const image = path.resolve(path.dirname(source), item.image);
  const extension = path.extname(image).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) throw new Error("Invalid image type");
  const relative = `images/${item.id}${extension}`;
  await fs.copyFile(image, path.join(target, relative), fs.constants.COPYFILE_EXCL);
  cases.push({ id: String(item.id), name: `Фото ${item.id}`, image: relative });
}
await fs.writeFile(path.join(target, "manifest.json"), JSON.stringify({ version: 1, cases }, null, 2), { flag: "wx" });
console.log(`Private dataset prepared: ${cases.length} images in ${target}`);
