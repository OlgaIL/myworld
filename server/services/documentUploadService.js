import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { query, withTransaction } from "../db/index.js";
import { userUploadsDir } from "../config/paths.js";
import { DOCUMENT_PAGE_LIMIT, DOCUMENT_UPLOAD_BATCH_LIMIT } from "../config/documentLimits.js";
import { createPhoto } from "../repositories/photosRepository.js";
import { loadDocuments, lockDocumentRows } from "../repositories/documentsRepository.js";
import { getUserProductAccess } from "../utils/photos.js";
import { getProcessingPipelineForUser } from "./processingPipelineService.js";
import { assertDocumentsIdle, documentId, pageId, expectedVersion, documentRefusal, runDocumentOperation } from "./documentService.js";
import { deletePhotosForUser } from "./photoDeletionService.js";
import { cleanupAccountDeletion } from "./accountDeletionCleanupService.js";
import { beginFileIntent } from "../repositories/guestFileIntentsRepository.js";

const mimeExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const lease = "30 minutes";
function selection(body) {
  const mode = body?.mode;
  if (!["separate", "group", "append", "replace"].includes(mode)) throw documentRefusal("INVALID_UPLOAD_SELECTION", 422);
  const targetDocumentId = ["append","replace"].includes(mode) ? documentId(body?.targetDocumentId) : null;
  const version = targetDocumentId ? expectedVersion(body?.expectedVersion) : null;
  const replacedPageId = mode === "replace" ? pageId(body?.pageId) : null;
  const items = body?.items;
  if (!Array.isArray(items) || !items.length || items.length > DOCUMENT_UPLOAD_BATCH_LIMIT)
    throw documentRefusal("INVALID_UPLOAD_SELECTION", 422);
  if (mode !== "separate" && items.length > DOCUMENT_PAGE_LIMIT) throw documentRefusal("DOCUMENT_PAGE_LIMIT", 422);
  if (mode === "replace" && items.length !== 1) throw documentRefusal("INVALID_UPLOAD_SELECTION", 422);
  const normalized = items.map((item, index) => {
    const id = documentId(item?.itemId);
    if (item.ordinal !== index + 1 || typeof item.name !== "string" || !item.name.trim() || item.name.length > 255
      || /[\u0000-\u001f]/u.test(item.name) || !Number.isSafeInteger(item.size) || item.size <= 0
      || item.size > 10 * 1024 * 1024 || !mimeExtensions[item.mimeType]) throw documentRefusal("INVALID_UPLOAD_SELECTION", 422);
    return { itemId: id, ordinal: index + 1, name: item.name, size: item.size, mimeType: item.mimeType };
  });
  if (new Set(normalized.map(i => i.itemId)).size !== normalized.length) throw documentRefusal("INVALID_UPLOAD_SELECTION", 422);
  return { mode, targetDocumentId, expectedVersion: version, replacedPageId, items: normalized };
}
function replacementPage(doc, id) {
  const page=doc.pages.find(p=>String(p.id)===id);
  if(!page)throw documentRefusal("PHOTO_NOT_FOUND",404);
  if(!["error","no_text"].includes(page.status))throw documentRefusal("PAGE_REPLACEMENT_NOT_ALLOWED");
  return page;
}

async function currentUser(client, userId) {
  const user = (await client.query("select * from users where id=$1 for update", [userId])).rows[0];
  if (!user) throw documentRefusal("UNAUTHORIZED", 401);
  return user;
}
function assertBudget(user, count) {
  const access = getUserProductAccess(user, Number(user.records_processed_total || 0));
  if (!access.unlimitedAccess && !access.extendedAccessActive && access.totalRemaining < count)
    throw Object.assign(documentRefusal("INSUFFICIENT_PROCESSING_BALANCE"), { available: access.totalRemaining, selected: count });
}
async function loadBatch(client, userId, id, { lock = false } = {}) {
  const batch = (await client.query(`select * from document_upload_batches where id=$1 and user_id=$2${lock ? " for update" : ""}`,
    [id, userId])).rows[0];
  if (!batch) throw documentRefusal("UPLOAD_BATCH_NOT_FOUND", 404);
  return batch;
}
async function itemsFor(client, id) {
  return (await client.query(`select i.*, p.filename, dp.document_id, dp.position from document_upload_items i
    left join photos p on p.id=i.photo_id left join document_pages dp on dp.photo_id=i.photo_id
    where i.batch_id=$1 order by i.ordinal`, [id])).rows;
}
function batchState(batch, items) {
  const expired = batch.state === "active" && new Date(batch.lease_until).getTime() <= Date.now();
  return { batchId: batch.id, mode: batch.mode, state: expired ? "expired" : batch.state,
    targetDocumentId: batch.target_document_id, leaseUntil: batch.lease_until,
    pageLimit: DOCUMENT_PAGE_LIMIT, items: items.map(i => ({ itemId: i.item_id, ordinal: i.ordinal,
      name: i.name, size: Number(i.size), mimeType: i.mime_type,
      state: i.state === "stored" && !i.photo_id ? "removed" : i.state, error: i.error_code,
      photoId: i.photo_id ? String(i.photo_id) : null, filename: i.filename || null,
      documentId: i.document_id || null, position: i.position || null })) };
}
export async function getDocumentUpload(userId, id) {
  id = documentId(id);
  // A consistent snapshot; GET never renews or creates an upload.
  return withTransaction(async client => {
    await client.query("set transaction isolation level repeatable read");
    return batchState(await loadBatch(client, userId, id), await itemsFor(client, id));
  });
}
export async function beginDocumentUpload(userId, body) {
  const id = documentId(body?.batchId), request = selection(body);
  await runDocumentOperation(userId, id, "upload-start", request, async client => {
    const user = await currentUser(client, userId);
    assertBudget(user, request.items.length);
    if (request.targetDocumentId) {
      const rows = await lockDocumentRows(client, userId, [request.targetDocumentId]);
      if (!rows.length) throw documentRefusal("DOCUMENT_NOT_FOUND", 404);
      if (String(rows[0].structure_version) !== request.expectedVersion) throw documentRefusal("DOCUMENT_VERSION_CONFLICT");
      await assertDocumentsIdle(client, userId, [request.targetDocumentId]);
      const [doc] = await loadDocuments(userId, [request.targetDocumentId], client.query.bind(client));
      if(request.mode === "replace")replacementPage(doc,request.replacedPageId);
      else if (doc.pages.length + request.items.length > DOCUMENT_PAGE_LIMIT) throw documentRefusal("DOCUMENT_PAGE_LIMIT", 422);
    }
    await client.query(`insert into document_upload_batches(id,user_id,mode,target_document_id,initial_structure_version,lease_until)
      values($1,$2,$3,$4,$5,now()+$6::interval)`, [id,userId,request.mode,request.targetDocumentId,request.expectedVersion,lease]);
    for (const item of request.items) await client.query(`insert into document_upload_items(batch_id,item_id,ordinal,name,size,mime_type)
      values($1,$2,$3,$4,$5,$6)`, [id,item.itemId,item.ordinal,item.name,item.size,item.mimeType]);
    return { batchId: id, ...(request.replacedPageId ? { replacedPageId:request.replacedPageId } : {}) };
  });
  return getDocumentUpload(userId, id);
}

function assertActive(batch) {
  if (batch.state !== "active" || new Date(batch.lease_until).getTime() <= Date.now()) throw documentRefusal("UPLOAD_BATCH_CLOSED");
}
export async function storeDocumentUploadItem(userId, batchId, itemId, file) {
  batchId = documentId(batchId); itemId = documentId(itemId);
  if (!file?.buffer?.length || !mimeExtensions[file.mimetype]) throw documentRefusal("INVALID_UPLOAD_FILE", 422);
  if (file.buffer.length > 10 * 1024 * 1024) throw documentRefusal("FILE_TOO_LARGE", 413);
  const digest = crypto.createHash("sha256").update(file.buffer).digest("hex");
  let createdFile;
  let fileIntent;
  const cleanupJobs=[];
  try {
    await withTransaction(async client => {
      await client.query("set local lock_timeout = '3s'");
      const user = await currentUser(client, userId);
      const batch = await loadBatch(client, userId, batchId, { lock: true });
      const item = (await client.query("select * from document_upload_items where batch_id=$1 and item_id=$2 for update", [batchId,itemId])).rows[0];
      if (!item) throw documentRefusal("UPLOAD_ITEM_NOT_FOUND", 404);
      if (item.state === "stored") {
        if (item.content_sha256 !== digest || item.mime_type !== file.mimetype || Number(item.size) !== file.buffer.length)
          throw documentRefusal("UPLOAD_ITEM_CONTENT_CHANGED");
        return; // Including tombstones: never recreate a deleted photo from an old batch.
      }
      assertActive(batch);
      if (item.state !== "pending") throw documentRefusal("UPLOAD_ITEM_CLOSED");
      if (item.mime_type !== file.mimetype || Number(item.size) !== file.buffer.length) throw documentRefusal("UPLOAD_ITEM_CONTENT_CHANGED");
      assertBudget(user, 1);
      let replacement;
      if (batch.target_document_id) {
        const [target] = await lockDocumentRows(client, userId, [batch.target_document_id]);
        if (!target) throw documentRefusal("DOCUMENT_NOT_FOUND", 404);
        const count = (await client.query("select count(*)::int as n from document_pages where document_id=$1", [target.id])).rows[0].n;
        if (batch.mode === "replace") {
          const receipt=(await client.query("select result_json from document_operations where user_id=$1 and operation_id=$2 and kind='upload-start'",[userId,batchId])).rows[0];
          const [doc]=await loadDocuments(userId,[target.id],client.query.bind(client));
          replacement=replacementPage(doc,receipt?.result_json?.replacedPageId);
          if(doc.processing_active||doc.review_active)throw documentRefusal("DOCUMENT_BUSY");
        } else if (count >= DOCUMENT_PAGE_LIMIT) throw documentRefusal("DOCUMENT_PAGE_LIMIT", 422);
      }
      const filename = `${Date.now()}-${crypto.randomUUID()}.${mimeExtensions[file.mimetype]}`;
      const storagePath = path.join(userUploadsDir, filename);
      // Reuse the durable file-intent queue. A crash after disk write and before
      // COMMIT leaves a discoverable orphan for the existing cleanup worker.
      fileIntent=await beginFileIntent({kind:"upload",userId,destinationPath:storagePath,
        expiresAt:new Date(Date.now()+30*60*1000)});
      await fs.writeFile(storagePath, file.buffer, { flag: "wx" });
      createdFile = storagePath;
      const pipeline = getProcessingPipelineForUser(user);
      const photo = await createPhoto({ userId, filename, storagePath: createdFile, mimeType: file.mimetype,
        sizeBytes: file.buffer.length, status: "uploaded", ocrProvider: pipeline.ocrProvider, aiProvider: pipeline.aiProvider },
      { transaction: callback => callback(client) });
      const single = (await client.query("select document_id from document_pages where photo_id=$1",[photo.id])).rows[0].document_id;
      let targetId = batch.target_document_id;
      if (batch.mode === "group" && !targetId) {
        targetId = single;
        await client.query("update document_upload_batches set target_document_id=$2 where id=$1", [batchId,targetId]);
      }
      await client.query(`update document_upload_items set photo_id=$3, content_sha256=$4, state='stored', error_code=null
        where batch_id=$1 and item_id=$2`, [batchId,itemId,photo.id,digest]);
      if (replacement) {
        await client.query("update document_pages set document_id=$1,position=$2 where photo_id=$3 and user_id=$4",[targetId,replacement.position,photo.id,userId]);
        await client.query("delete from documents where id=$1 and user_id=$2",[single,userId]);
        await client.query(`update documents set metadata_source_photo_id=case when metadata_source_photo_id=$2 then $3 else metadata_source_photo_id end,
          metadata_state=case when not metadata_frozen then 'pending' else metadata_state end,
          structure_version=structure_version+1,updated_at=now() where id=$1`,[targetId,replacement.id,photo.id]);
        const deletion=await deletePhotosForUser(userId,[replacement.filename],{transaction:callback=>callback(client),allowDocumentPages:true,
          cleanup:async jobId=>{cleanupJobs.push(jobId);return {cleanupPending:true};}});
        if(deletion.failed.length||deletion.deleted.length!==1)throw documentRefusal(deletion.failed[0]?.code||"PAGE_REPLACEMENT_FAILED");
      } else if (targetId) {
        // Original append pages stay first; new slots are always ordered by their
        // declared ordinal even when HTTP requests arrive in the opposite order.
        const originals = (await client.query(`select dp.photo_id::text from document_pages dp where dp.document_id=$1
          and not exists(select 1 from document_upload_items i where i.batch_id=$2 and i.photo_id=dp.photo_id)
          order by dp.position`, [targetId,batchId])).rows.map(p => p.photo_id);
        const uploaded = (await itemsFor(client,batchId)).filter(i=>i.photo_id).map(i=>String(i.photo_id));
        await client.query(`update document_pages dp set document_id=$1, position=input.position::int
          from unnest($2::bigint[]) with ordinality as input(id,position) where dp.photo_id=input.id and dp.user_id=$3`,
        [targetId,[...originals,...uploaded],userId]);
        if (single !== targetId) await client.query("delete from documents where id=$1 and user_id=$2",[single,userId]);
        if (batch.mode === "group") {
          const first = (await client.query("select * from photos where id=$1",[uploaded[0]])).rows[0];
          await client.query(`update documents set title=$2,display_title=$3,summary=$4,category=$5,section=$6,topic=$7,tags=$8::jsonb,
            metadata_source_photo_id=$9,metadata_state=$10,archive_at=(select max(p.created_at) from photos p
              join document_pages dp on dp.photo_id=p.id where dp.document_id=$1) where id=$1`,
          [targetId,first.title,first.display_title,first.summary,first.category,first.section,first.topic,JSON.stringify(first.tags),
            first.id,["processed","no_text"].includes(first.status)?"ready":"pending"]);
        }
        await client.query(`update documents set metadata_frozen=true,structure_version=structure_version+1,updated_at=now() where id=$1`,[targetId]);
      }
      await client.query("update document_upload_batches set lease_until=now()+$2::interval where id=$1",[batchId,lease]);
      await client.query("delete from guest_file_intents where id=$1",[fileIntent.id]);
    });
  } catch (error) {
    // Only the new UUID path belongs to this attempt. Existing photos and files
    // are untouched when any transaction step fails.
    if (createdFile) {
      try {
        // A COMMIT acknowledgement can be lost. Never remove a path still
        // referenced by a committed row; when DB state is unknown retain it.
        const persisted = await query("select 1 from photos where storage_path=$1",[createdFile]);
        if (!persisted.rowCount) await fs.unlink(createdFile).catch(e => { if (e.code !== "ENOENT") throw e; });
        if(fileIntent)await query("delete from guest_file_intents where id=$1",[fileIntent.id]);
      } catch (cleanupError) { console.error("Upload rollback file cleanup deferred", { code: cleanupError.code }); }
    } else if(fileIntent)await query("delete from guest_file_intents where id=$1",[fileIntent.id]).catch(()=>{});
    throw error;
  } finally {
    if(fileIntent)await fileIntent.release();
  }
  for(const jobId of cleanupJobs){
    try{await cleanupAccountDeletion(jobId,{batchSize:1000,log:()=>{}});}catch{ /* Durable worker retries after the committed replacement. */ }
  }
  return getDocumentUpload(userId, batchId);
}

export async function closeDocumentUpload(userId, id, cancel = false) {
  id = documentId(id);
  await withTransaction(async client => {
    const batch = await loadBatch(client,userId,id,{lock:true});
    if (batch.state !== "active") return;
    const items = await itemsFor(client,id), stored = items.filter(i=>i.state === "stored").length;
    const expired = new Date(batch.lease_until).getTime() <= Date.now();
    const state = expired ? "expired" : cancel ? "cancelled" : stored === items.length ? "completed" : "partial";
    await client.query("update document_upload_items set state='cancelled' where batch_id=$1 and state='pending'",[id]);
    await client.query("update document_upload_batches set state=$2,lease_until=now() where id=$1",[id,state]);
  });
  return getDocumentUpload(userId,id);
}
