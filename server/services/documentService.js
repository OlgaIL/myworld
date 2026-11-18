import crypto from "node:crypto";
import { query, withTransaction } from "../db/index.js";
import { DOCUMENT_PAGE_LIMIT } from "../config/documentLimits.js";
import { loadDocuments, loadDocumentActivity, lockDocumentRows, createDocumentForPage, resolveDocumentLocation } from "../repositories/documentsRepository.js";
import { mapPhotoInfo } from "../utils/photos.js";

export class DocumentError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export const documentRefusal = (code, status) => new DocumentError(code, status);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function documentId(value) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw documentRefusal("INVALID_SELECTION", 422);
  return value.toLowerCase();
}
export function pageId(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value)
    || BigInt(value) > 9223372036854775807n) throw documentRefusal("INVALID_SELECTION", 422);
  return value;
}
export function expectedVersion(value) {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isSafeInteger(value)))
    throw documentRefusal("INVALID_SELECTION", 422);
  const version = String(value);
  if (!/^[1-9]\d{0,18}$/.test(version) || BigInt(version) > 9223372036854775807n)
    throw documentRefusal("INVALID_SELECTION", 422);
  return version;
}

export function mapDocument(row, { detail = false } = {}) {
  const pages = row.pages || [];
  // The current first page is the header source. Stored creation snapshots are
  // retained for compatibility, but cannot override a new first page after edits.
  const header = pages[0] || row;
  const tags = [...new Set(pages.flatMap(p => Array.isArray(p.tags) ? p.tags : []))];
  const counts = {};
  for (const page of pages) counts[page.status] = (counts[page.status] || 0) + 1;
  const busy = Boolean(row.upload_active || row.processing_active || row.review_active);
  const document = {
    id: row.id, title: header.title, displayTitle: header.display_title,
    summary: header.summary, category: header.category, section: header.section, topic: header.topic,
    tags, metadataState: pages.length ? (["processed", "no_text"].includes(header.status) ? "ready" : "pending") : row.metadata_state,
    structureVersion: String(row.structure_version),
    createdAt: row.created_at, archiveAt: row.archive_at, updatedAt: row.updated_at,
    pageCount: pages.length, coverPageId: pages[0] ? String(pages[0].id) : null,
    coverFilename: pages[0]?.filename ?? null, statusCounts: counts,
    pageLimit: DOCUMENT_PAGE_LIMIT,
    availableActions: {
      merge: !busy && pages.length === 1,
      reorder: !busy && pages.length > 1,
      extract: !busy && pages.length > 1,
      split: !busy && pages.length > 1,
      append: !busy && pages.length < DOCUMENT_PAGE_LIMIT,
      delete: !busy
    }
  };
  if (!detail) return { ...document, searchPages: pages.map(p => {
    const info = mapPhotoInfo(p);
    return { pageId: String(p.id), title: info.title, summary: info.summary,
      text: info.text, cleanText: info.cleanText, tags: info.tags };
  }) };
  return { document, pages: pages.map(p => ({ ...mapPhotoInfo(p), pageId: String(p.id), position: p.position, addedFromArchive: Boolean(p.addedFromArchive) })) };
}

export async function listDocuments(userId) {
  return (await loadDocuments(userId)).map(row => mapDocument(row));
}
export async function getDocument(userId, id) {
  id = documentId(id);
  const row = (await loadDocuments(userId, [id]))[0];
  if (row) return mapDocument(row, { detail: true });
  const location = await resolveDocumentLocation(userId, { documentId: id });
  if (!location) throw documentRefusal("DOCUMENT_NOT_FOUND", 404);
  return { ...await getDocument(userId, location.document_id), redirectedFrom: id, anchorPageId: String(location.photo_id) };
}
export async function getPageLocation(userId, filename) {
  if (typeof filename !== "string" || !filename || filename.length > 255 || /[\\/\u0000-\u001f]/.test(filename))
    throw documentRefusal("INVALID_SELECTION", 422);
  const location = await resolveDocumentLocation(userId, { filename });
  if (!location) throw documentRefusal("DOCUMENT_NOT_FOUND", 404);
  return { documentId: location.document_id, pageId: String(location.photo_id),
    position: location.position, structureVersion: String(location.structure_version) };
}

export async function assertDocumentsIdle(client, userId, ids) {
  const states = await loadDocumentActivity(userId, ids, client.query.bind(client));
  if (states.some(s => s.upload_active)) throw documentRefusal("UPLOAD_BATCH_ACTIVE");
  if (states.some(s => s.processing_active || s.review_active)) throw documentRefusal("DOCUMENT_BUSY");
}

// Caller holds the exclusive account lock, shared with all existing upload/OCR
// paths. Receipt and data commit together; a lost response is safe to retry.
export async function runDocumentOperation(userId, operationId, kind, request, mutate, { transaction = withTransaction } = {}) {
  operationId = documentId(operationId);
  const hash = crypto.createHash("sha256").update(JSON.stringify(request)).digest("hex");
  return transaction(async client => {
    await client.query("set local lock_timeout = '3s'");
    await client.query("select pg_advisory_xact_lock(763659, hashtext($1))", [`${userId}:${operationId}`]);
    const receipt = (await client.query(`select * from document_operations where user_id = $1 and operation_id = $2`, [userId, operationId])).rows[0];
    if (receipt) {
      if (receipt.kind !== kind || receipt.request_hash !== hash) throw documentRefusal("OPERATION_KEY_REUSED");
      return receipt.result_json;
    }
    const result = await mutate(client);
    await client.query(`insert into document_operations(user_id, operation_id, kind, request_hash, result_json)
      values($1,$2,$3,$4,$5::jsonb)`, [userId, operationId, kind, hash, JSON.stringify(result)]);
    return result;
  });
}

export async function getDocumentOperation(userId, id) {
  const result = await query("select result_json from document_operations where user_id = $1 and operation_id = $2", [userId, documentId(id)]);
  if (!result.rowCount) throw documentRefusal("OPERATION_NOT_FOUND", 404);
  return result.rows[0].result_json;
}

async function lockSelection(client, userId, sources) {
  const rows = await lockDocumentRows(client, userId, sources.map(s => s.documentId));
  if (rows.length !== sources.length) throw documentRefusal("DOCUMENT_NOT_FOUND", 404);
  for (const source of sources) {
    if (String(rows.find(r => r.id === source.documentId).structure_version) !== source.expectedVersion)
      throw documentRefusal("DOCUMENT_VERSION_CONFLICT");
  }
  await assertDocumentsIdle(client, userId, sources.map(s => s.documentId));
  return loadDocuments(userId, sources.map(s => s.documentId), client.query.bind(client));
}
function sourceSelection(sources) {
  if (!Array.isArray(sources) || !sources.length) throw documentRefusal("INVALID_SELECTION", 422);
  if (sources.length > DOCUMENT_PAGE_LIMIT) throw documentRefusal("DOCUMENT_PAGE_LIMIT", 422);
  const normalized = sources.map(s => ({ documentId: documentId(s?.documentId), expectedVersion: expectedVersion(s?.expectedVersion) }));
  if (new Set(normalized.map(s => s.documentId)).size !== normalized.length) throw documentRefusal("INVALID_SELECTION", 422);
  return normalized;
}
function pageOrder(ids) {
  if (!Array.isArray(ids) || !ids.length) throw documentRefusal("INVALID_PAGE_ORDER", 422);
  if (ids.length > DOCUMENT_PAGE_LIMIT) throw documentRefusal("DOCUMENT_PAGE_LIMIT", 422);
  const result = ids.map(pageId);
  if (new Set(result).size !== result.length) throw documentRefusal("INVALID_PAGE_ORDER", 422);
  return result;
}
function samePages(order, pages) {
  const actual = new Set(pages.map(p => String(p.id)));
  return order.length === actual.size && order.every(id => actual.has(id));
}
async function setOrder(client, userId, targetId, ids) {
  await client.query(`update document_pages dp set document_id = $2,
      position = input.position::integer
    from unnest($3::bigint[]) with ordinality as input(photo_id, position)
    where dp.user_id = $1 and dp.photo_id = input.photo_id`, [userId, targetId, ids]);
}
async function documentVersions(client, userId, ids) {
  // Receipts contain references, never a second copy of recognized contents.
  // The client reads current pages through GET after a successful mutation.
  return (await loadDocuments(userId, ids, client.query.bind(client))).map(r => ({
    id: r.id, structureVersion: String(r.structure_version), pageCount: r.pages.length
  }));
}

export async function mergeDocuments(userId, body) {
  const sources = sourceSelection(body?.sources);
  if (sources.length < 2) throw documentRefusal("INVALID_SELECTION", 422);
  const order = pageOrder(body?.orderedPageIds);
  return runDocumentOperation(userId, body?.operationId, "merge", { sources, order }, async client => {
    const rows = await lockSelection(client, userId, sources);
    if (rows.some(r => r.pages.length !== 1)) throw documentRefusal("MULTIPAGE_MERGE_NOT_SUPPORTED");
    const pages = rows.flatMap(r => r.pages);
    if (!samePages(order, pages)) throw documentRefusal("INVALID_PAGE_ORDER", 422);
    const first = rows.find(r => String(r.pages[0].id) === order[0]);
    const removed = rows.filter(r => r.id !== first.id);
    await setOrder(client, userId, first.id, order);
    await client.query("update document_pages set added_from_archive=true where user_id=$1 and photo_id=any($2::bigint[])",[userId,order]);
    for (const row of removed) {
      await client.query(`insert into document_aliases(old_document_id, user_id, anchor_photo_id) values($1,$2,$3)`, [row.id, userId, row.pages[0].id]);
      await client.query("delete from documents where id = $1 and user_id = $2", [row.id, userId]);
    }
    await client.query(`update documents set structure_version = structure_version + 1, metadata_frozen = true,
      archive_at = (select max(p.created_at) from photos p join document_pages dp on dp.photo_id = p.id where dp.document_id = $1),
      updated_at = now() where id = $1 and user_id = $2`, [first.id, userId]);
    return { documents: await documentVersions(client, userId, [first.id]), removedDocumentIds: removed.map(r => r.id) };
  });
}

export async function appendArchiveDocuments(userId,id,body) {
  const target={documentId:documentId(id),expectedVersion:expectedVersion(body?.expectedVersion)};
  const sources=sourceSelection(body?.sources);
  if(sources.some(s=>s.documentId===target.documentId))throw documentRefusal("INVALID_SELECTION",422);
  return runDocumentOperation(userId,body?.operationId,"append-archive",{target,sources},async client=>{
    const rows=await lockSelection(client,userId,[target,...sources]);
    const destination=rows.find(r=>r.id===target.documentId),incoming=rows.filter(r=>r.id!==target.documentId);
    if(incoming.some(r=>r.pages.length!==1))throw documentRefusal("MULTIPAGE_MERGE_NOT_SUPPORTED");
    if(destination.pages.length+incoming.length>DOCUMENT_PAGE_LIMIT)throw documentRefusal("DOCUMENT_PAGE_LIMIT",422);
    incoming.sort((a,b)=>new Date(a.pages[0].created_at)-new Date(b.pages[0].created_at)
      || (BigInt(a.pages[0].id)<BigInt(b.pages[0].id)?-1:1));
    await setOrder(client,userId,target.documentId,[...destination.pages,...incoming.flatMap(r=>r.pages)].map(p=>String(p.id)));
    await client.query("update document_pages set added_from_archive=true where user_id=$1 and photo_id=any($2::bigint[])",[userId,incoming.flatMap(r=>r.pages).map(p=>String(p.id))]);
    for(const row of incoming){
      await client.query("insert into document_aliases(old_document_id,user_id,anchor_photo_id) values($1,$2,$3)",[row.id,userId,row.pages[0].id]);
      await client.query("delete from documents where id=$1 and user_id=$2",[row.id,userId]);
    }
    await client.query("update documents set metadata_frozen=true,structure_version=structure_version+1,updated_at=now() where id=$1",[target.documentId]);
    return {documents:await documentVersions(client,userId,[target.documentId]),removedDocumentIds:incoming.map(r=>r.id)};
  });
}

export async function reorderDocument(userId, id, body) {
  const source = { documentId: documentId(id), expectedVersion: expectedVersion(body?.expectedVersion) };
  const order = pageOrder(body?.pageIds);
  return runDocumentOperation(userId, body?.operationId, "reorder", { source, order }, async client => {
    const [row] = await lockSelection(client, userId, [source]);
    if (!samePages(order, row.pages)) throw documentRefusal("INVALID_PAGE_ORDER", 422);
    await setOrder(client, userId, source.documentId, order);
    await client.query("update documents set structure_version = structure_version + 1, updated_at = now() where id = $1", [source.documentId]);
    return { documents: await documentVersions(client, userId, [source.documentId]) };
  });
}

export async function extractDocumentPage(userId, id, body) {
  const source = { documentId: documentId(id), expectedVersion: expectedVersion(body?.expectedVersion) };
  const selected = pageId(body?.pageId);
  return runDocumentOperation(userId, body?.operationId, "extract", { source, selected }, async client => {
    const [row] = await lockSelection(client, userId, [source]);
    if (row.pages.length < 2 || !row.pages.some(p => String(p.id) === selected)) throw documentRefusal("INVALID_SELECTION", 422);
    const newId = await createDocumentForPage(client, userId, selected);
    await setOrder(client, userId, newId, [selected]);
    await setOrder(client, userId, row.id, row.pages.filter(p => String(p.id) !== selected).map(p => String(p.id)));
    await client.query("update documents set structure_version = structure_version + 1, updated_at = now() where id = $1", [row.id]);
    return { documents: await documentVersions(client, userId, [row.id, newId]) };
  });
}

export async function splitDocument(userId, id, body) {
  const source = { documentId: documentId(id), expectedVersion: expectedVersion(body?.expectedVersion) };
  return runDocumentOperation(userId, body?.operationId, "split", { source }, async client => {
    const [row] = await lockSelection(client, userId, [source]);
    if (row.pages.length < 2) throw documentRefusal("INVALID_SELECTION", 422);
    const newIds = [];
    for (const page of row.pages.slice(1)) {
      const newId = await createDocumentForPage(client, userId, page.id);
      await setOrder(client, userId, newId, [String(page.id)]);
      newIds.push(newId);
    }
    await setOrder(client, userId, row.id, [String(row.pages[0].id)]);
    // The surviving first page restores its own metadata/date; the group's
    // frozen snapshot may have come from a different page before reordering.
    const first = row.pages[0];
    await client.query(`update documents set title = $2, display_title = $3,
      summary = $4, category = $5, section = $6, topic = $7, tags = $8::jsonb,
      metadata_source_photo_id = $9, metadata_state = $10, metadata_frozen = false, archive_at = $11,
      structure_version = structure_version + 1, updated_at = now() where id = $1`,
    [row.id, first.title, first.display_title, first.summary, first.category, first.section, first.topic,
      JSON.stringify(first.tags), first.id, ["processed", "no_text"].includes(first.status) ? "ready" : "pending", first.created_at]);
    return { documents: await documentVersions(client, userId, [row.id, ...newIds]) };
  });
}
