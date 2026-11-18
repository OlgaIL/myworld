import { Router } from "express";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";
import { withAccountOperation } from "../services/accountOperationLocks.js";
import {
  listDocuments, getDocument, getPageLocation, getDocumentOperation,
  mergeDocuments, appendArchiveDocuments, reorderDocument, extractDocumentPage, splitDocument
} from "../services/documentService.js";
import { deleteDocumentsForUser } from "../services/documentDeletionService.js";

const router = Router();
router.use(["/api/documents", "/api/document-location", "/api/document-operations"], (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
function handle(action) {
  return async (req, res) => {
    try { return res.json(await action(req)); }
    catch (error) {
      const lockConflict = ["55P03", "40P01"].includes(error.code);
      if (!error.status && !lockConflict) console.error("Document operation failed:", { code: error.code || "DOCUMENT_OPERATION_FAILED" });
      return res.status(error.status || (lockConflict ? 409 : 500)).json({
        error: error.status ? error.code : lockConflict ? "ACCOUNT_BUSY" : "DOCUMENT_OPERATION_FAILED"
      });
    }
  };
}
function read(path, action) { router.get(path, requireAuthenticatedUser, handle(action)); }
function write(method, path, action) {
  router[method](path, requireAuthenticatedUser, withAccountOperation(handle(action), { exclusive: true }));
}
read("/api/documents", async req => ({ documents: await listDocuments(req.user.id) }));
read("/api/documents/:id", req => getDocument(req.user.id, req.params.id));
read("/api/document-location/:name", req => getPageLocation(req.user.id, req.params.name));
read("/api/document-operations/:id", async req => {
  const result = await getDocumentOperation(req.user.id, req.params.id);
  if (!result.cleanupJobIds) return result;
  // A receipt confirms deletion; cleanup jobs are internal and may still run.
  const { cleanupJobIds, ...rest } = result;
  return { ...rest, cleanupPending: cleanupJobIds.length > 0 };
});
write("post", "/api/documents/merge", req => mergeDocuments(req.user.id, req.body));
write("post", "/api/documents/:id/append-from-archive", req => appendArchiveDocuments(req.user.id, req.params.id, req.body));
write("put", "/api/documents/:id/page-order", req => reorderDocument(req.user.id, req.params.id, req.body));
write("post", "/api/documents/:id/extract", req => extractDocumentPage(req.user.id, req.params.id, req.body));
write("post", "/api/documents/:id/split", req => splitDocument(req.user.id, req.params.id, req.body));
write("post", "/api/documents/delete-batch", req => deleteDocumentsForUser(req.user.id, req.body));

export default router;
