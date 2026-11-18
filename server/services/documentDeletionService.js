import { DOCUMENT_DELETE_BATCH_LIMIT, DOCUMENT_DELETE_PAGE_LIMIT } from "../config/documentLimits.js";
import { lockDocumentRows, loadDocuments } from "../repositories/documentsRepository.js";
import { deletePhotosForUser } from "./photoDeletionService.js";
import { cleanupAccountDeletion } from "./accountDeletionCleanupService.js";
import { assertDocumentsIdle, documentId, expectedVersion, documentRefusal, runDocumentOperation } from "./documentService.js";

// Reuse the existing photo deletion/tombstone/file-queue rules. Its transaction
// and cleanup hooks let one document form an atomic unit without local IO after
// an inner savepoint: file cleanup only happens after the outer COMMIT.
export async function deleteDocumentsForUser(userId, body, { inspectFile, cleanup = cleanupAccountDeletion } = {}) {
  if (!Array.isArray(body?.documents) || !body.documents.length || body.documents.length > DOCUMENT_DELETE_BATCH_LIMIT)
    throw documentRefusal("INVALID_DELETE_SELECTION", 422);
  const targets = body.documents.map(d => ({ id: documentId(d?.id), expectedVersion: expectedVersion(d?.expectedVersion) }));
  if (new Set(targets.map(d => d.id)).size !== targets.length) throw documentRefusal("INVALID_DELETE_SELECTION", 422);
  const result = await runDocumentOperation(userId, body?.operationId, "delete", { targets }, async client => {
    const locked = await lockDocumentRows(client, userId, targets.map(d => d.id));
    const rows = await loadDocuments(userId, locked.map(d => d.id), client.query.bind(client));
    if (rows.reduce((n, d) => n + d.pages.length, 0) > DOCUMENT_DELETE_PAGE_LIMIT)
      throw documentRefusal("DOCUMENT_DELETE_PAGE_LIMIT", 422);
    const deleted = [], missing = [], failed = [], cleanupJobIds = [];
    for (const target of targets) {
      const row = rows.find(d => d.id === target.id);
      if (!row) { missing.push(target.id); continue; }
      await client.query("savepoint delete_whole_document");
      const jobs = [];
      try {
        if (String(row.structure_version) !== target.expectedVersion) throw documentRefusal("DOCUMENT_VERSION_CONFLICT");
        await assertDocumentsIdle(client, userId, [row.id]);
        const state = await deletePhotosForUser(userId, row.pages.map(p => p.filename), {
          transaction: callback => callback(client), allowDocumentPages: true,
          ...(inspectFile ? { inspectFile } : {}),
          cleanup: async jobId => { jobs.push(jobId); return { cleanupPending: true }; }
        });
        if (state.failed.length || state.missing.length || state.deleted.length !== row.pages.length)
          throw documentRefusal(state.failed[0]?.code || "DOCUMENT_DELETE_FAILED");
        await client.query("release savepoint delete_whole_document");
        deleted.push(row.id);
        cleanupJobIds.push(...jobs);
      } catch (error) {
        await client.query("rollback to savepoint delete_whole_document");
        await client.query("release savepoint delete_whole_document");
        const known = ["DOCUMENT_BUSY", "UPLOAD_BATCH_ACTIVE", "DOCUMENT_VERSION_CONFLICT", "DOCUMENT_SHARED_DATA", "UNSAFE_DOCUMENT_FILE"];
        failed.push({ id: row.id, code: known.includes(error.code) ? error.code : "DOCUMENT_DELETE_FAILED" });
      }
    }
    return { deleted, missing, failed, cleanupJobIds };
  });
  let cleanupPending = false;
  for (const jobId of result.cleanupJobIds) {
    try {
      const state = await cleanup(jobId, { batchSize: 1000, log: () => {} });
      cleanupPending ||= state?.cleanupPending !== false;
    } catch { cleanupPending = true; }
  }
  const { cleanupJobIds, ...publicResult } = result;
  return { ...publicResult, cleanupPending };
}
