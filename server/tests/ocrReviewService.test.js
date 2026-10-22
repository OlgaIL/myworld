import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createOcrReviewService, mapOcrReviewResult } from "../services/ocrReviewService.js";
import { mapPhotoInfo } from "../utils/photos.js";

test("the same model result produces the same public document as the normal photo mapper", () => {
  const content = { blocks: [{ type: "paragraph", text: "fixed word" }] };
  const corrections = [{ id: "correction-1", original: "raw word", replacement: "fixed word",
    blockIndex: 0, itemIndex: null, start: 0, end: 10, applied: false }];
  const result = { title: "Title", summary: "Summary", category: "Other", section: "Other", topic: "Topic", tags: ["tag"],
    cleanText: "fixed word", formattedContent: content, corrections, notes: "OCR note",
    hasTable: false, hasFormulas: false, hasRecognitionErrors: true, textQuality: "full_text" };
  const normal = mapPhotoInfo({ filename: "sample", status: "processed", ocr_text: "raw word", clean_text: "fixed word",
    title: "Title", summary: "Summary", category: "Other", section: "Other", topic: "Topic", tags: ["tag"],
    formatted_content: content, corrections, ai_notes: "OCR note", has_table: false, has_formulas: false,
    has_recognition_errors: true, text_quality: "full_text" });
  const review = mapOcrReviewResult("sample", "raw word", result);
  assert.deepEqual(review, normal);
  assert.equal(review.cleanText, "raw word");
  assert.equal(review.formattedContent.blocks[0].text, "raw word");
  assert.equal("blockIndex" in review.corrections[0], false);
});

test("review uses shared pipeline services without persisting metrics or documents", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-review-"));
  try {
    const datasetDirectory = path.join(directory, "cases");
    await fs.mkdir(datasetDirectory);
    const manifestPath = path.join(datasetDirectory, "manifest.json");
    await fs.writeFile(path.join(datasetDirectory, "one.png"), "synthetic image");
    await fs.writeFile(path.join(directory, "outside.png"), "outside image");
    await fs.writeFile(manifestPath, JSON.stringify({ version: 1, cases: [{ id: "one", image: "one.png" }] }));
    let recognized = 0, enriched = 0, tables = 0;
    const service = createOcrReviewService({ manifestPath,
      getPipeline: (_user, { audience }) => ({ audience, pipeline: "standard", ocrProvider: "google", aiProvider: "yandex" }),
      async recognize() { recognized++; return "Synthetic text longer than ten characters"; },
      async enrich(_text, _pipeline, options) {
        enriched++; await options.persistMetrics("must not write to the database");
        return { cleanText: "Result", hasTable: true, formattedContent: { blocks: [{ type: "paragraph", text: "Result" }] } };
      },
      async extractTables(photo, options) {
        tables++; assert.equal(await options.resolveImage(photo.storage_path), path.join(datasetDirectory, "one.png"));
        return { status: "ready", content: { blocks: [{ type: "table", headers: ["A"], rows: [["B"]] }] } };
      }
    });
    const result = await service.process("one", "paid");
    assert.equal(result.info.status, "processed");
    assert.equal(result.pipeline.audience, "paid");
    assert.equal(result.info.hasTable, true);
    assert.equal((await service.tables("one", result.info)).tableStatus, "ready");
    assert.deepEqual([recognized, enriched, tables], [1, 1, 1]);
    const fastService = createOcrReviewService({ manifestPath,
      getPipeline: () => ({ pipeline: "fast", ocrProvider: "openai", aiProvider: "openai" }),
      async processImage() { return { ocrText: "Original image OCR", cleanText: "Edited text",
        formattedContent: { blocks: [{ type: "paragraph", text: "Edited text" }] } }; }
    });
    assert.equal((await fastService.process("one", "guest")).info.text, "Original image OCR");
    await fs.writeFile(manifestPath, JSON.stringify({ version: 1, cases: [{ id: "outside", image: "../outside.png" }] }));
    await assert.rejects(() => service.image("outside"), /UNSAFE_CASE_IMAGE/);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith("ocr-review-"));
    await fs.rm(directory, { recursive: true });
  }
});
