import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOcrResult } from "../utils/ocr.js";
import { mapPhotoInfo } from "../utils/photos.js";
import { buildRecognizedResult } from "./partialProcessingService.js";
import { extractDocumentTables } from "./documentTableService.js";
import { canProcessImageWithPipeline, enrichWithPipeline, getProcessingPipelineForUser,
  processImageWithPipeline, recognizeWithPipeline } from "./processingPipelineService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mimeTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
export const audiences = ["guest", "free", "paid"];

// Adapt an in-memory result to the same record mapper used by /api/photos.
// No user document is inserted or updated.
export function mapOcrReviewResult(id, text, result = {}, status = "processed") {
  const value = status === "recognized" ? buildRecognizedResult(text, result.error) : result;
  return mapPhotoInfo({
    filename: String(id), status, ocr_text: text, clean_text: value.cleanText,
    title: value.title, summary: value.summary, category: value.category,
    section: value.section, topic: value.topic, tags: value.tags,
    formatted_content: value.formattedContent, has_table: value.hasTable,
    has_formulas: value.hasFormulas, has_recognition_errors: value.hasRecognitionErrors,
    corrections: value.corrections, text_quality: value.textQuality,
    ai_notes: value.aiNotes ?? value.notes, error_message: value.errorMessage ?? value.error
  });
}

export function createOcrReviewService({ manifestPath = process.env.OCR_REVIEW_MANIFEST_PATH
  || path.join(root, "outputs/ocr-review-dataset/manifest.json"),
  recognize = recognizeWithPipeline, enrich = enrichWithPipeline, processImage = processImageWithPipeline,
  extractTables = extractDocumentTables, getPipeline = getProcessingPipelineForUser } = {}) {
  async function dataset() {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (manifest.version !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length > 100) throw new Error("INVALID_DATASET");
    const ids = manifest.cases.map((item) => String(item.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^[\w-]{1,80}$/u.test(id))) throw new Error("INVALID_DATASET");
    return manifest;
  }
  async function image(id) {
    const item = (await dataset()).cases.find((entry) => String(entry.id) === id);
    if (!item) throw Object.assign(new Error("CASE_NOT_FOUND"), { status: 404 });
    const directory = await fs.realpath(path.dirname(manifestPath));
    const filename = await fs.realpath(path.resolve(directory, item.image));
    const relative = path.relative(directory, filename);
    const mime = mimeTypes[path.extname(filename).toLowerCase()];
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !mime
      || !(await fs.stat(filename)).isFile()) throw new Error("UNSAFE_CASE_IMAGE");
    return { path: filename, mime };
  }
  return {
    async list() {
      return { cases: (await dataset()).cases.map((item) => ({ id: String(item.id), name: String(item.name || `Фото ${item.id}`) })),
        profiles: Object.fromEntries(audiences.map((audience) => [audience, getPipeline({}, { audience })])) };
    },
    image,
    async process(id, audience) {
      if (!audiences.includes(audience)) throw Object.assign(new Error("INVALID_PROFILE"), { status: 400 });
      const file = await image(id);
      const pipeline = getPipeline({}, { audience });
      const startedAt = Date.now();
      const options = { persistMetrics: async () => {} };
      let text = "", result;
      if (canProcessImageWithPipeline(pipeline)) {
        result = await processImage(file.path, pipeline, options);
        text = result.ocrText || result.cleanText || "";
        if (result.error) return { info: mapOcrReviewResult(id, "", result, "error"), pipeline, durationMs: Date.now() - startedAt };
        if (text.trim().length < 10 && result.textQuality === "no_meaningful_text") {
          return { info: mapOcrReviewResult(id, text, {}, "no_text"), pipeline, durationMs: Date.now() - startedAt };
        }
      } else {
        const ocr = normalizeOcrResult(await recognize(file.path, pipeline));
        if (ocr.error) throw new Error("OCR_FAILED");
        text = ocr.text;
        if (text.trim().length < 10) return { info: mapOcrReviewResult(id, text, {}, "no_text"), pipeline, durationMs: Date.now() - startedAt };
        result = await enrich(text, pipeline, options);
      }
      const info = mapOcrReviewResult(id, text, result, result.error ? "recognized" : "processed");
      return { info, pipeline, durationMs: Date.now() - startedAt };
    },
    async tables(id, info) {
      const file = await image(id);
      const result = await extractTables({ storage_path: file.path, mime_type: file.mime, ocr_text: info.text },
        { resolveImage: async () => (await image(id)).path });
      return { ...info, tableStatus: result.status, tableContent: result.content || null, tableErrorCode: result.code || null };
    }
  };
}
