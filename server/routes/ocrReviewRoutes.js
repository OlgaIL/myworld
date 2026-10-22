import { Router } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createOcrReviewService } from "../services/ocrReviewService.js";

export function createOcrReviewRouter({ requireAdmin, service = createOcrReviewService() }) {
  const router = Router();
  const cache = new Map();
  let active = false;
  router.use(requireAdmin, (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.get("/cases", async (req, res) => {
    req.session.ocrReviewToken ||= randomBytes(32).toString("hex");
    try { res.json({ ...await service.list(), token: req.session.ocrReviewToken }); }
    catch { res.status(503).json({ error: "OCR_REVIEW_DATASET_UNAVAILABLE" }); }
  });
  router.get("/cases/:id/file", async (req, res) => {
    try { const file = await service.image(req.params.id); res.type(file.mime).sendFile(file.path); }
    catch { res.status(404).json({ error: "CASE_IMAGE_NOT_FOUND" }); }
  });
  router.use((req, res, next) => {
    const expected = Buffer.from(req.session.ocrReviewToken || "");
    const supplied = Buffer.from(String(req.get("X-Ocr-Review-Token") || ""));
    if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(403).json({ error: "OCR_REVIEW_TOKEN_REQUIRED" });
    }
    if (!/^[\w-]{1,80}$/u.test(String(req.body?.runId || ""))) return res.status(400).json({ error: "INVALID_RUN" });
    next();
  });
  function key(req) { return `${req.session.ocrReviewToken}:${req.body.runId}:${req.params.id}`; }
  async function execute(req, res, operation, suffix = "") {
    const cacheKey = key(req) + suffix;
    for (const [entryKey, entry] of cache) if (Date.now() - entry.createdAt > 30 * 60 * 1000) cache.delete(entryKey);
    if (cache.has(cacheKey)) return res.json(await cache.get(cacheKey).promise);
    if (active) return res.status(409).json({ error: "OCR_REVIEW_BUSY" });
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    active = true;
    const promise = (async () => {
      try { return await operation(); }
      catch { return { info: { status: "error", error: "Обработка не завершена. Повторите этот пример." } }; }
      finally { active = false; }
    })();
    cache.set(cacheKey, { promise, createdAt: Date.now() });
    const result = await promise;
    if (suffix === ":tables" && result.info?.tableStatus !== "ready") cache.delete(cacheKey);
    res.json(result);
  }
  router.post("/cases/:id/process", (req, res) => execute(req, res, () => service.process(req.params.id, req.body.audience)));
  router.post("/cases/:id/tables", async (req, res) => {
    const processed = cache.get(key(req));
    if (!processed) return res.status(409).json({ error: "OCR_REVIEW_RUN_EXPIRED" });
    const result = await processed.promise;
    if (!["processed", "recognized"].includes(result.info?.status)) return res.status(409).json({ error: "OCR_REVIEW_NOT_PROCESSED" });
    return execute(req, res, async () => ({ info: await service.tables(req.params.id, result.info) }), ":tables");
  });
  return router;
}
