import fs from "node:fs/promises";
import { query } from "../db/index.js";
import { matchesOcrLayout } from "../utils/ocrLayout.js";
import { normalizeOcrResult } from "../utils/ocr.js";
import { recognizeWithPipeline } from "./processingPipelineService.js";

export async function loadPhotoOcrLayout(photo, runQuery = query) {
  if (!photo?.id || !photo.user_id) return null;
  const result = await runQuery(`select l.artifact from document_ocr_layouts l
    join photos p on p.id = l.photo_id where p.id = $1 and p.user_id = $2`, [photo.id, photo.user_id]);
  return result.rows[0]?.artifact || null;
}

// Persist immediately after OCR, before the text LLM. A failed enrichment/restart
// must not throw away a paid OCR result. Ownership is checked again in the write.
export async function recognizeAndCacheOcr(document, pipeline, { guest = false,
  recognize = recognizeWithPipeline, runQuery = query, readImage = fs.readFile } = {}) {
  if (pipeline.ocrProvider !== "google") return recognize(document.storage_path, pipeline);
  const ownerId = guest ? document.guest_session_id : document.user_id;
  const parent = guest ? "guest_documents" : "photos";
  const owner = guest ? "guest_session_id" : "user_id";
  const column = guest ? "guest_document_id" : "photo_id";
  const cached = await runQuery(`select l.artifact from document_ocr_layouts l
    join ${parent} d on d.id = l.${column} where d.id = $1 and d.${owner} = $2`, [document.id, ownerId]);
  const image = await readImage(document.storage_path);
  const layout = cached.rows[0]?.artifact;
  if (matchesOcrLayout(layout, image)) return { text: layout.text, error: null, layout, reused: true };
  const result = normalizeOcrResult(await recognize(document.storage_path, pipeline, { captureLayout: true }));
  if (result.error || !result.layout) return result;
  if (!matchesOcrLayout(result.layout, image)) {
    throw new Error("OCR_IMAGE_CHANGED");
  }
  const saved = await runQuery(`insert into document_ocr_layouts (${column}, artifact)
    select id, $3::jsonb from ${parent} where id = $1 and ${owner} = $2
    on conflict (${column}) do update set artifact = excluded.artifact, created_at = now()
    returning id`, [document.id, ownerId, JSON.stringify(result.layout)]);
  if (!saved.rows.length) throw new Error("OCR_DOCUMENT_GONE");
  return result;
}
