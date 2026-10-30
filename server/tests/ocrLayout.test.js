import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleOcrLayout, matchesOcrLayout } from "../utils/ocrLayout.js";
import { recognizeAndCacheOcr, loadPhotoOcrLayout } from "../services/ocrLayoutService.js";
import { extractDocumentTables } from "../services/documentTableService.js";

const image = Buffer.from("synthetic-source-image");
const response = { fullTextAnnotation: { pages: [{ width: 300, height: 200 }] }, textAnnotations: [
  { description: "Original OCR text" }, { description: "Original", boundingPoly: { vertices: [
    {}, { x: 10 }, { x: 10, y: 20 }, { y: 20 }
  ] } }
] };
const layout = buildGoogleOcrLayout(response, image, "Repaired OCR text");

test("OCR layout keeps raw and repaired text, image identity and zero coordinates", () => {
  assert.equal(layout.rawText, "Original OCR text");
  assert.equal(layout.text, "Repaired OCR text");
  assert.equal(layout.width, 300);
  assert.deepEqual(layout.textAnnotations[1].boundingPoly.vertices[0], { x: 0, y: 0 });
  assert.equal(matchesOcrLayout(layout, image), true);
  assert.equal(matchesOcrLayout(layout, Buffer.from("rotated-or-replaced")), false);
  assert.equal(matchesOcrLayout({ ...layout, version: 2 }, image), false);
  assert.equal(buildGoogleOcrLayout({ error: { code: 8 } }, image, ""), null);
});

test("first OCR is persisted before enrichment, reused after restart, and owner-scoped", async () => {
  let stored, calls = 0;
  const doc = { id: 11, user_id: 22, storage_path: "synthetic" };
  const options = {
    readImage: async () => image,
    recognize: async (_path, _pipeline, opts) => {
      assert.equal(opts.captureLayout, true); calls++;
      return { text: layout.text, layout };
    },
    runQuery: async (sql, values) => {
      assert.deepEqual(values.slice(0, 2), [11, 22]);
      if (sql.startsWith("select")) return { rows: stored ? [{ artifact: stored }] : [] };
      assert.match(sql, /where id = \$1 and user_id = \$2/);
      stored = JSON.parse(values[2]); return { rows: [{ id: 1 }] };
    }
  };
  assert.equal((await recognizeAndCacheOcr(doc, { ocrProvider: "google" }, options)).text, layout.text);
  assert.equal(stored.rawText, layout.rawText); // survives a later text-LLM failure
  assert.equal((await recognizeAndCacheOcr(doc, { ocrProvider: "google" }, options)).reused, true);
  assert.equal(calls, 1);
  const reloaded = await loadPhotoOcrLayout(doc, async (sql, values) => {
    assert.match(sql, /p.user_id = \$2/); assert.deepEqual(values, [11, 22]);
    return { rows: [{ artifact: stored }] };
  });
  assert.deepEqual(reloaded, layout);
});

test("guest layout is persisted under the guest session; failed OCR is never cached", async () => {
  const queries = [];
  const doc = { id: 33, guest_session_id: 44, storage_path: "synthetic" };
  await recognizeAndCacheOcr(doc, { ocrProvider: "google" }, {
    guest: true, readImage: async () => image, recognize: async () => ({ text: layout.text, layout }),
    runQuery: async (sql, values) => { queries.push(sql); assert.deepEqual(values.slice(0, 2), [33, 44]);
      return { rows: sql.startsWith("select") ? [] : [{ id: 1 }] }; }
  });
  assert.match(queries[1], /guest_document_id/);
  assert.match(queries[1], /guest_session_id = \$2/);
  let writes = 0;
  const failed = await recognizeAndCacheOcr(doc, { ocrProvider: "google" }, {
    guest: true, readImage: async () => image, recognize: async () => ({ error: "quota", text: "" }),
    runQuery: async (sql) => { if (!sql.startsWith("select")) writes++; return { rows: [] }; }
  });
  assert.equal(failed.error, "quota"); assert.equal(writes, 0);
});

test("tables without matching saved geometry stop before any model request", async () => {
  let calls = 0;
  const photo = { mime_type: "image/png", storage_path: new URL(import.meta.url).pathname };
  const options = {
    config: { enabled: true, apiKey: "synthetic", model: "synthetic", baseURL: "https://synthetic.invalid/v1", timeoutMs: 1000, maxTokens: 6000 },
    resolveImage: async () => new URL(import.meta.url),
    client: { chat: { completions: { create: async () => { calls++; throw new Error("must not call"); } } } },
    loadLayout: async () => null
  };
  assert.equal((await extractDocumentTables(photo, options)).code, "TABLE_SOURCE_REUPLOAD_REQUIRED");
  assert.equal((await extractDocumentTables(photo, { ...options, layout })).code, "TABLE_SOURCE_CHANGED");
  assert.equal(calls, 0);
});
