import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import dotenv from "dotenv";
import pg from "pg";
import express from "express";

// Only a disposable schema on a verified local DB. Do not load provider keys,
// contact external services or apply migrations to the user's archive.
const config = dotenv.parse(await fs.readFile(new URL("../.env", import.meta.url)));
const url = new URL(config.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "LOCAL_DATABASE_REQUIRED");
const schema = `multipage_test_${crypto.randomBytes(10).toString("hex")}`;
const root = await fs.mkdtemp(path.join(os.tmpdir(), "myworld-multipage-"));
url.searchParams.set("options", `-c search_path=${schema}`);
Object.assign(process.env, { DATABASE_URL: url.href, DATABASE_SSL: "false", NODE_ENV: "test",
  MYWORLD_TEST_UPLOADS_DIR: root, PROCESSING_ENABLED: "false", GOOGLE_CLOUD_PROJECT: "synthetic-tests",
  METADATA_SERVER_DETECTION: "none", GCE_METADATA_HOST: "127.0.0.1:9" });
for (const key of ["OPENAI_API_KEY", "YANDEX_API_KEY", "YANDEX_FOLDER_ID", "TIMEWEB_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLIENT_SECRET", "YANDEX_CLIENT_SECRET",
  "VK_CLIENT_SECRET", "SBER_CLIENT_SECRET", "MTS_CLIENT_SECRET", "YOOKASSA_SECRET_KEY",
  "SMTP_PASSWORD", "TELEGRAM_BOT_TOKEN", "YANDEX_METRIKA_API_TOKEN"]) process.env[key] = "";
globalThis.__myworldEnvLoaded = true;

const { query, withTransaction, closeDatabaseConnection } = await import("../db/index.js");
const { closeAccountOperationLocks, acquireAccountOperationLock } = await import("../services/accountOperationLocks.js");
const { userUploadsDir, ensurePrivateUploadDirectories } = await import("../config/paths.js");
const { deleteDocumentsForUser } = await import("../services/documentDeletionService.js");
const { transferGuestDocument } = await import("../services/guestStorageService.js");
const { guestUploadsDir } = await import("../config/paths.js");
const { createPhoto } = await import("../repositories/photosRepository.js");
const { managedFile } = await import("../services/guestStorageFiles.js");
const { closeFileIntentLocks } = await import("../repositories/guestFileIntentsRepository.js");
const documentRoutes = (await import("../routes/documentRoutes.js")).default;
const documentUploadRoutes = (await import("../routes/documentUploadRoutes.js")).default;
const photoRoutes = (await import("../routes/photoRoutes.js")).default;
const authRoutes = (await import("../routes/authRoutes.js")).default;
const adminUrl = new URL(url); adminUrl.searchParams.delete("options");
const admin = new pg.Client({ connectionString: adminUrl.href });
let server;
let base;
const operationId = () => crypto.randomUUID();
const owner = async () => (await query("insert into users(display_name,email) values('Synthetic',$1) returning *", [`${operationId()}@example.test`])).rows[0];
async function photo(user, { title = "Synthetic", status = "processed", createdAt = new Date(), tags = [], fields = {} } = {}) {
  const name = `${operationId()}.jpg`, file = path.join(userUploadsDir, name);
  await fs.writeFile(file, "synthetic image");
  const row = (await query(`insert into photos(user_id,filename,storage_path,title,status,created_at,clean_text,ocr_text,tags,formatted_content)
    values($1,$2,$3,$4,$5,$6,'Synthetic text','Synthetic OCR',$7::jsonb,'{"blocks":[{"type":"paragraph","text":"Synthetic text"}]}') returning *`,
  [user.id, name, file, title, status, createdAt, JSON.stringify(tags)])).rows[0];
  for (const [key, value] of Object.entries(fields)) {
    assert.ok(["has_table", "has_recognition_errors", "summary"].includes(key));
    await query(`update photos set ${key}=$2 where id=$1`, [row.id, value]);
  }
  return row;
}
const exists = file => fs.stat(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; });
async function request(user, route, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { "content-type": "application/json",
    ...(user ? { "x-test-user": String(user.id) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function detail(user, id) {
  const result = await request(user, `/api/documents/${id}`); assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data;
}
async function location(user, p) {
  const result = await request(user, `/api/document-location/${p.filename}`); assert.equal(result.status, 200); return result.data;
}
async function merge(user, pages) {
  const locations = await Promise.all(pages.map(p => location(user, p)));
  const body = { operationId: operationId(), sources: locations.map(l => ({ documentId: l.documentId, expectedVersion: l.structureVersion })),
    orderedPageIds: pages.map(p => String(p.id)) };
  const result = await request(user, "/api/documents/merge", { method: "POST", body });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { body, result: result.data, id: result.data.documents[0].id };
}
const snapshot = async user => (await query("select * from photos where user_id=$1 order by id", [user.id])).rows;
const uploadBody = (mode="group",count=3,extra={}) => ({batchId:operationId(),mode,...extra,
  items:Array.from({length:count},(_,index)=>({itemId:operationId(),ordinal:index+1,name:`page-${index+1}.jpg`,size:3,mimeType:"image/jpeg"}))});
async function uploadItem(user,batch,index,content="abc") {
  const form=new FormData();form.append("photo",new Blob([content],{type:"image/jpeg"}),"page.jpg");
  const response=await fetch(`${base}/api/document-uploads/${batch.batchId}/items/${batch.items[index].itemId}`,
    {method:"PUT",headers:user?{"x-test-user":String(user.id)}:{},body:form});
  return {status:response.status,data:await response.json()};
}
const beginUpload=(user,body)=>request(user,"/api/document-uploads",{method:"POST",body});
const closeUpload=(user,body,kind="finish")=>request(user,`/api/document-uploads/${body.batchId}/${kind}`,{method:"POST",body:{}});

test("multi-page documents: migration, ownership, structure, receipts and deletion", async t => {
  await admin.connect();
  try {
    await admin.query(`create schema ${schema}`);
    ensurePrivateUploadDirectories();
    const migrations = (await fs.readdir(new URL("../db/migrations/", import.meta.url))).filter(n => n.endsWith(".sql")).sort();
    for (const name of migrations.filter(n => n < "049_")) await query(await fs.readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8"));
    const oldUser = await owner();
    await photo(oldUser, { title: "Old first", createdAt: "2026-01-01T10:00:00Z" });
    await photo(oldUser, { title: "Old second", status: "recognized", createdAt: "2026-02-01T10:00:00Z" });
    await query("update users set records_processed_total=17,processing_used=3,documents_created_total=8 where id=$1", [oldUser.id]);
    const oldPhotos = await snapshot(oldUser);
    const oldAccount = (await query("select * from users where id=$1", [oldUser.id])).rows[0];
    for (const name of migrations.filter(n => n >= "049_"))
      await withTransaction(client => fs.readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8").then(sql => client.query(sql)));
    const app = express(); app.use(express.json());
    app.use((req,res,next) => { if (req.headers["x-test-user"]) req.user = { id: req.headers["x-test-user"] }; next(); });
    app.use(documentRoutes); app.use(documentUploadRoutes); app.use(photoRoutes); app.use(authRoutes);
    server = await new Promise(resolve => { const s = app.listen(0,"127.0.0.1",()=>resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;

    await t.test("migration preserves every old photo field, balances, historical counters and archive dates", async () => {
      assert.deepEqual(await snapshot(oldUser), oldPhotos);
      assert.deepEqual((await query("select * from users where id=$1", [oldUser.id])).rows[0], oldAccount);
      const list = await request(oldUser, "/api/documents"); assert.equal(list.status, 200);
      assert.equal(list.data.documents.length, 2);
      for (const p of oldPhotos) {
        const l = await location(oldUser,p), d = await detail(oldUser,l.documentId);
        assert.equal(d.document.pageCount, 1); assert.equal(d.pages[0].id,p.filename);
        assert.equal(d.document.archiveAt,p.created_at.toISOString());
        assert.equal(d.document.displayTitle,p.display_title);
        assert.equal(d.pages[0].cleanText,p.clean_text);
      }
    });

    await t.test("guests and foreign owners cannot read documents, aliases, operations or mutate", async () => {
      const user = await owner(), foreign = await owner(), p = await photo(user), l = await location(user,p);
      for (const route of ["/api/documents",`/api/documents/${l.documentId}`,`/api/document-location/${p.filename}`,`/api/document-operations/${operationId()}`])
        assert.equal((await request(null,route)).status,401);
      for (const route of [`/api/documents/${l.documentId}`,`/api/document-location/${p.filename}`])
        assert.equal((await request(foreign,route)).status,404);
      for (const [method, route] of [["POST","/api/documents/merge"],["PUT",`/api/documents/${l.documentId}/page-order`],
        ["POST",`/api/documents/${l.documentId}/extract`],["POST",`/api/documents/${l.documentId}/split`],["POST","/api/documents/delete-batch"]])
        assert.equal((await request(null,route,{method,body:{}})).status,401);
      const result = await request(foreign,`/api/documents/${l.documentId}/page-order`,{method:"PUT",body:{operationId:operationId(),expectedVersion:1,pageIds:[p.id]}});
      assert.equal(result.status,404);
    });

    await t.test("merge preserves content/accounting, snapshots first metadata, unions tags and search across all pages", async () => {
      const user = await owner(), a = await photo(user,{title:"First",createdAt:"2026-01-01Z",tags:["one"]}),
        b = await photo(user,{title:"Second",createdAt:"2026-03-01Z",tags:["two","one"]});
      const before = await snapshot(user), account = (await query("select * from users where id=$1",[user.id])).rows[0];
      const merged = await merge(user,[a,b]);
      const d = await detail(user,merged.id);
      assert.deepEqual(d.pages.map(p=>p.pageId),[a.id,b.id]);
      assert.deepEqual(d.pages.map(p=>p.position),[1,2]);
      assert.deepEqual(d.pages.map(p=>p.addedFromArchive),[true,true]);
      assert.equal(d.document.title,"First");assert.equal(d.document.archiveAt,"2026-03-01T00:00:00.000Z");
      assert.deepEqual(d.document.tags,["one","two"]);
      const list = (await request(user,"/api/documents")).data.documents;
      assert.equal(list.length,1);assert.deepEqual(list[0].searchPages.map(p=>p.title),["First","Second"]);
      const me = await request(user,"/api/me");assert.equal(me.status,200);
      assert.equal(me.data.documentsStored,1);assert.equal(me.data.pagesStored,2);assert.equal(me.data.recordsStored,2);
      assert.deepEqual(await snapshot(user),before);
      assert.deepEqual((await query("select * from users where id=$1",[user.id])).rows[0],account);
      assert.ok(!(JSON.stringify(merged.result).includes("Synthetic text")),"receipt has no second copy of text");
    });

    await t.test("lost-response retry returns the same result; reuse with different payload is rejected", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),merged=await merge(user,[a,b]);
      const retry=await request(user,"/api/documents/merge",{method:"POST",body:merged.body});
      assert.equal(retry.status,200);assert.deepEqual(retry.data,merged.result);
      assert.deepEqual((await request(user,`/api/document-operations/${merged.body.operationId}`)).data,merged.result);
      assert.equal((await request(await owner(),`/api/document-operations/${merged.body.operationId}`)).status,404);
      const changed=await request(user,"/api/documents/merge",{method:"POST",body:{...merged.body,orderedPageIds:[b.id,a.id]}});
      assert.equal(changed.status,409);assert.equal(changed.data.error,"OPERATION_KEY_REUSED");
      assert.equal((await detail(user,merged.id)).document.pageCount,2);
    });

    await t.test("reordering changes the header to the current first page and preserves the archive date", async () => {
      const user=await owner(),a=await photo(user,{title:"Original header"}),b=await photo(user,{title:"New first page",fields:{summary:"New first page summary"}}),merged=await merge(user,[a,b]);
      const before=await detail(user,merged.id),version=before.document.structureVersion;
      const body={operationId:operationId(),expectedVersion:version,pageIds:[b.id,a.id]};
      const result=await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body});assert.equal(result.status,200);
      const after=await detail(user,merged.id);assert.deepEqual(after.pages.map(p=>p.pageId),[b.id,a.id]);
      assert.equal(after.document.title,b.title);assert.equal(after.document.summary,"New first page summary");assert.equal(after.document.archiveAt,before.document.archiveAt);
      const card=(await request(user,"/api/documents")).data.documents.find(d=>d.id===merged.id);
      assert.equal(card.displayTitle,after.document.displayTitle);assert.equal(card.summary,after.document.summary);
      assert.equal(Number(after.document.structureVersion),Number(version)+1);
      const stale=await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body:{...body,operationId:operationId()}});
      assert.equal(stale.status,409);assert.equal(stale.data.error,"DOCUMENT_VERSION_CONFLICT");
      for (const pageIds of [[a.id,a.id],[a.id],[a.id,"999999999"]]) {
        const bad=await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body:{operationId:operationId(),expectedVersion:after.document.structureVersion,pageIds}});
        assert.equal(bad.status,422);assert.equal(bad.data.error,"INVALID_PAGE_ORDER");
      }
    });

    await t.test("extract/split preserve page identities and old aliases follow the current page location", async () => {
      const user=await owner(),a=await photo(user,{title:"A",createdAt:"2026-01-01Z"}),b=await photo(user,{title:"B",createdAt:"2026-02-01Z"}),c=await photo(user,{title:"C",createdAt:"2026-03-01Z"});
      const oldB=await location(user,b),before=await snapshot(user),merged=await merge(user,[a,b,c]);
      const extracted=await request(user,`/api/documents/${merged.id}/extract`,{method:"POST",body:{operationId:operationId(),expectedVersion:2,pageId:b.id}});
      assert.equal(extracted.status,200,JSON.stringify(extracted.data));
      const newB=await location(user,b);assert.notEqual(newB.documentId,merged.id);
      const alias=await detail(user,oldB.documentId);assert.equal(alias.document.id,newB.documentId);assert.equal(alias.anchorPageId,b.id);
      assert.equal((await detail(user,newB.documentId)).document.archiveAt,b.created_at.toISOString());
      const split=await request(user,`/api/documents/${merged.id}/split`,{method:"POST",body:{operationId:operationId(),expectedVersion:3}});
      assert.equal(split.status,200,JSON.stringify(split.data));
      for(const p of [a,b,c]){const l=await location(user,p),d=await detail(user,l.documentId);
        assert.equal(d.document.pageCount,1);assert.equal(d.document.title,p.title);assert.equal(d.document.archiveAt,p.created_at.toISOString());}
      assert.deepEqual(await snapshot(user),before);
    });

    await t.test("splitting a reordered document restores each page's metadata/date and unique archive titles", async () => {
      const user=await owner(),a=await photo(user,{title:"Same",createdAt:"2026-01-01Z"}),b=await photo(user,{title:"Same",createdAt:"2026-02-01Z"}),merged=await merge(user,[a,b]);
      await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body:{operationId:operationId(),expectedVersion:2,pageIds:[b.id,a.id]}});
      const split=await request(user,`/api/documents/${merged.id}/split`,{method:"POST",body:{operationId:operationId(),expectedVersion:3}});
      assert.equal(split.status,200);
      const d=await detail(user,merged.id);assert.equal(d.pages[0].pageId,b.id);assert.equal(d.document.archiveAt,b.created_at.toISOString());
      const list=(await request(user,"/api/documents")).data.documents;assert.equal(new Set(list.map(d=>d.displayTitle.toLowerCase())).size,2);
    });

    await t.test("a multi-page source rejects the entire mixed merge without moving other pages", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),c=await photo(user),merged=await merge(user,[a,b]),lc=await location(user,c);
      const result=await request(user,"/api/documents/merge",{method:"POST",body:{operationId:operationId(),sources:[{documentId:merged.id,expectedVersion:2},{documentId:lc.documentId,expectedVersion:1}],orderedPageIds:[a.id,b.id,c.id]}});
      assert.equal(result.status,409);assert.equal(result.data.error,"MULTIPAGE_MERGE_NOT_SUPPORTED");
      assert.equal((await detail(user,merged.id)).document.pageCount,2);assert.equal((await location(user,c)).documentId,lc.documentId);
    });

    await t.test("25 pages accepted, 26 rejected before changes; duplicate/foreign selections rejected", async () => {
      const user=await owner(),pages=[];for(let i=0;i<26;i++)pages.push(await photo(user));
      const locations=await Promise.all(pages.map(p=>location(user,p)));
      const body={operationId:operationId(),sources:locations.map(l=>({documentId:l.documentId,expectedVersion:1})),orderedPageIds:pages.map(p=>p.id)};
      const over=await request(user,"/api/documents/merge",{method:"POST",body});assert.equal(over.status,422);assert.equal(over.data.error,"DOCUMENT_PAGE_LIMIT");
      assert.equal((await request(user,"/api/documents")).data.documents.length,26);
      const accepted=await merge(user,pages.slice(0,25));assert.equal((await detail(user,accepted.id)).document.pageCount,25);
      const duplicate=await request(user,"/api/documents/merge",{method:"POST",body:{...body,sources:[body.sources[25],body.sources[25]],orderedPageIds:[pages[25].id,pages[25].id]}});
      assert.equal(duplicate.status,422);
    });

    await t.test("unprocessed/error/no-text pages can merge; running OCR/review/lease blocks operations", async () => {
      const user=await owner(),a=await photo(user,{status:"error"}),b=await photo(user,{status:"uploaded"}),c=await photo(user,{status:"no_text"}),merged=await merge(user,[a,b,c]);
      assert.deepEqual((await detail(user,merged.id)).document.statusCounts,{error:1,uploaded:1,no_text:1});
      const body={operationId:operationId(),expectedVersion:2,pageIds:[c.id,b.id,a.id]};
      await query("update photos set status='processing' where id=$1",[a.id]);
      let r=await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body});assert.equal(r.status,409);assert.equal(r.data.error,"DOCUMENT_BUSY");
      await query("update photos set status='error' where id=$1",[a.id]);
      const review=(await query("insert into recognition_improvement_requests(user_id,photo_id,status,manual_review_consent_at) values($1,$2,'in_review',now()) returning id",[user.id,a.id])).rows[0];
      r=await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body});assert.equal(r.status,409);assert.equal(r.data.error,"DOCUMENT_BUSY");
      await query("update recognition_improvement_requests set status='cancelled' where id=$1",[review.id]);
      const batch=operationId();await query("insert into document_upload_batches(id,user_id,mode,target_document_id,lease_until) values($1,$2,'append',$3,now()+interval '1 hour')",[batch,user.id,merged.id]);
      assert.ok(Object.values((await detail(user,merged.id)).document.availableActions).every(allowed=>!allowed));
      r=await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body});assert.equal(r.status,409);assert.equal(r.data.error,"UPLOAD_BATCH_ACTIVE");
      await query("update document_upload_batches set lease_until=now()-interval '1 second' where id=$1",[batch]);
      assert.equal((await request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body})).status,200);
    });

    await t.test("account operation locks prevent overlap with uploads and admin review transitions", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),la=await location(user,a),lb=await location(user,b);
      const body={operationId:operationId(),sources:[{documentId:la.documentId,expectedVersion:1},{documentId:lb.documentId,expectedVersion:1}],orderedPageIds:[a.id,b.id]};
      const release=await acquireAccountOperationLock(user.id);assert.ok(release);
      try {const r=await request(user,"/api/documents/merge",{method:"POST",body});assert.equal(r.status,409);assert.equal(r.data.error,"ACCOUNT_BUSY");}finally{await release();}
      const exclusive=await acquireAccountOperationLock(user.id,{exclusive:true});assert.ok(exclusive);
      try{await assert.rejects(query("insert into recognition_improvement_requests(user_id,photo_id,manual_review_consent_at) values($1,$2,now())",[user.id,a.id]),e=>e.code==="55P03");}finally{await exclusive();}
      assert.equal((await request(user,"/api/documents/merge",{method:"POST",body})).status,200);
    });

    await t.test("concurrent stale requests cannot both change the same structure", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),merged=await merge(user,[a,b]);
      const results=await Promise.all([0,1].map(()=>request(user,`/api/documents/${merged.id}/page-order`,{method:"PUT",body:{operationId:operationId(),expectedVersion:2,pageIds:[b.id,a.id]}})));
      assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
      assert.equal((await detail(user,merged.id)).document.structureVersion,"3");
    });

    await t.test("legacy delete refuses interior pages without widening to delete their container", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),merged=await merge(user,[a,b]);
      const single=await request(user,`/api/photos/${a.filename}`,{method:"DELETE"});assert.equal(single.status,409);assert.equal(single.data.error,"DOCUMENT_PAGE_IN_GROUP");
      const batch=await request(user,"/api/photos/delete-batch",{method:"POST",body:{names:[a.filename,b.filename]}});
      assert.equal(batch.status,200);assert.equal(batch.data.deleted.length,0);assert.equal(batch.data.failed.length,2);
      assert.equal((await detail(user,merged.id)).document.pageCount,2);assert.ok(await exists(a.storage_path));assert.ok(await exists(b.storage_path));
    });

    await t.test("document deletion is all-or-nothing, cleans files after commit and is safe to retry", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),merged=await merge(user,[a,b]);
      const body={operationId:operationId(),documents:[{id:merged.id,expectedVersion:2}]};
      const result=await request(user,"/api/documents/delete-batch",{method:"POST",body});assert.equal(result.status,200);
      assert.deepEqual(result.data.deleted,[merged.id]);assert.deepEqual(result.data.failed,[]);assert.equal(result.data.cleanupPending,false);
      assert.equal((await request(user,`/api/documents/${merged.id}`)).status,404);assert.equal(await exists(a.storage_path),false);assert.equal(await exists(b.storage_path),false);
      const retry=await request(user,"/api/documents/delete-batch",{method:"POST",body});assert.deepEqual(retry.data,result.data);
      assert.equal((await query("select documents_deleted_total from users where id=$1",[user.id])).rows[0].documents_deleted_total,2);
      assert.equal((await query("select old_document_id from document_aliases where user_id=$1",[user.id])).rowCount,0);
    });

    await t.test("a file inspection failure on page two rolls back page one and its queued cleanup", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),merged=await merge(user,[a,b]);
      let inspected=0,cleaned=0;
      const release=await acquireAccountOperationLock(user.id,{exclusive:true});
      try{
        const result=await deleteDocumentsForUser(user.id,{operationId:operationId(),documents:[{id:merged.id,expectedVersion:2}]},{
          inspectFile:async(...args)=>{if(++inspected===2)throw Object.assign(new Error('unsafe synthetic'),{code:'UNSAFE_SYNTHETIC'});return managedFile(...args);},
          cleanup:async()=>{cleaned++;return {cleanupPending:false};}
        });
        assert.equal(result.deleted.length,0);assert.equal(result.failed.length,1);assert.equal(cleaned,0);
        assert.equal((await detail(user,merged.id)).document.pageCount,2);
        assert.ok(await exists(a.storage_path));assert.ok(await exists(b.storage_path));
        assert.equal((await query("select documents_deleted_total from users where id=$1",[user.id])).rows[0].documents_deleted_total,0);
      }finally{await release();}
    });

    await t.test("busy/stale documents survive a batch while an unrelated ready document can be deleted", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user),c=await photo(user),merged=await merge(user,[a,b]),lc=await location(user,c);
      await query("update photos set status='processing' where id=$1",[b.id]);
      const result=await request(user,"/api/documents/delete-batch",{method:"POST",body:{operationId:operationId(),documents:[{id:merged.id,expectedVersion:2},{id:lc.documentId,expectedVersion:1},{id:operationId(),expectedVersion:1}]}});
      assert.equal(result.status,200);assert.deepEqual(result.data.deleted,[lc.documentId]);assert.deepEqual(result.data.failed,[{id:merged.id,code:"DOCUMENT_BUSY"}]);assert.equal(result.data.missing.length,1);
      assert.equal((await detail(user,merged.id)).document.pageCount,2);
    });

    await t.test("every legacy writer and guest claim creates a single-page container in the same transaction", async () => {
      const user=await owner();
      const created=await createPhoto({userId:user.id,filename:`${operationId()}.jpg`,storagePath:path.join(userUploadsDir,`${operationId()}.jpg`),mimeType:"image/jpeg",sizeBytes:1,title:"Legacy writer"});
      assert.equal((await detail(user,(await location(user,created)).documentId)).document.pageCount,1);
      const session=(await query("insert into guest_sessions(session_token) values($1) returning id",[operationId()])).rows[0];
      const name=`${operationId()}.jpg`,source=path.join(guestUploadsDir,name);await fs.writeFile(source,"synthetic guest");
      const guest=(await query(`insert into guest_documents(guest_session_id,filename,storage_path,status,title,clean_text,expires_at)
        values($1,$2,$3,'processed','Guest title','Synthetic guest text',now()+interval '1 hour') returning *`,[session.id,name,source])).rows[0];
      const claimed=await transferGuestDocument(guest.id,user.id);
      const d=await detail(user,(await location(user,claimed)).documentId);assert.equal(d.document.title,"Guest title");assert.equal(d.pages[0].cleanText,"Synthetic guest text");
    });

    await t.test("DB constraints reject missing containers, foreign ownership and duplicate positions", async () => {
      const user=await owner(),foreign=await owner(),a=await photo(user),b=await photo(user),merged=await merge(user,[a,b]);
      await assert.rejects(withTransaction(async client=>{await client.query("delete from document_pages where photo_id=$1",[a.id]);}),e=>e.code==="23514");
      await assert.rejects(query("update document_pages set user_id=$2 where photo_id=$1",[a.id,foreign.id]),e=>e.code==="23503");
      await assert.rejects(withTransaction(async client=>{await client.query("update document_pages set position=1 where document_id=$1",[merged.id]);}),e=>e.code==="23505");
      await assert.rejects(withTransaction(async client=>{await client.query("insert into documents(user_id,display_title) values($1,'Empty')",[user.id]);}),e=>e.code==="23514");
      assert.equal((await detail(user,merged.id)).document.pageCount,2);
    });

    await t.test("extracting the first page moves the header source to the remaining page", async () => {
      const user=await owner(),a=await photo(user,{title:"Frozen source"}),b=await photo(user,{title:"Other page"}),merged=await merge(user,[a,b]);
      const result=await request(user,`/api/documents/${merged.id}/extract`,{method:"POST",body:{operationId:operationId(),expectedVersion:2,pageId:a.id}});
      assert.equal(result.status,200);
      await query("update photos set title='Updated extracted page' where id=$1",[a.id]);
      assert.equal((await detail(user,merged.id)).document.title,"Other page");
      assert.equal((await detail(user,(await location(user,a)).documentId)).document.title,"Updated extracted page");
      await query("update photos set title='Updated remaining page' where id=$1",[b.id]);
      assert.equal((await detail(user,merged.id)).document.title,"Updated remaining page");
    });

    await t.test("group header reflects the current first page's latest processed metadata", async () => {
      const user=await owner(),a=await photo(user,{title:"",status:"uploaded"}),b=await photo(user),merged=await merge(user,[a,b]);
      await query("update photos set title='First successful title',status='processed' where id=$1",[a.id]);
      assert.equal((await detail(user,merged.id)).document.title,"First successful title");
      await query("update photos set title='Later reprocessing title' where id=$1",[a.id]);
      assert.equal((await detail(user,merged.id)).document.title,"Later reprocessing title");
    });

    await t.test("upload lease cannot belong to another owner; malformed versions leave no receipt", async () => {
      const user=await owner(),foreign=await owner(),a=await photo(user),l=await location(user,a);
      await assert.rejects(query("insert into document_upload_batches(id,user_id,mode,target_document_id,lease_until) values($1,$2,'append',$3,now()+interval '1 hour')",[operationId(),foreign.id,l.documentId]),e=>e.code==="23503");
      for(const version of [[1],{},true,1.5,Number.MAX_SAFE_INTEGER+1]){
        const r=await request(user,`/api/documents/${l.documentId}/page-order`,{method:"PUT",body:{operationId:operationId(),expectedVersion:version,pageIds:[a.id]}});
        assert.equal(r.status,422);
      }
      assert.equal((await query("select 1 from document_operations where user_id=$1",[user.id])).rowCount,0);
      const foreignPhoto=await photo(foreign);
      await assert.rejects(query("update documents set metadata_source_photo_id=$2 where id=$1",[l.documentId,foreignPhoto.id]),e=>e.code==="23503");
    });

    await t.test("bigint page IDs retain exact identity through JSON and reordering", async () => {
      const user=await owner(),id="9007199254740993",name=`${operationId()}.jpg`;
      const p=(await query("insert into photos(id,user_id,filename,storage_path,status) values($1,$2,$3,$4,'error') returning *",[id,user.id,name,path.join(userUploadsDir,name)])).rows[0];
      const l=await location(user,p),d=await detail(user,l.documentId);assert.equal(d.pages[0].pageId,id);
      const r=await request(user,`/api/documents/${l.documentId}/page-order`,{method:"PUT",body:{operationId:operationId(),expectedVersion:1,pageIds:[id]}});
      assert.equal(r.status,200);assert.equal((await detail(user,l.documentId)).pages[0].pageId,id);
    });

    await t.test("batch budget is checked for the whole selection before creating any session, photo or file", async () => {
      const user=await owner();await query("update users set free_processing_limit=2 where id=$1",[user.id]);
      const before=await fs.readdir(userUploadsDir),body=uploadBody();
      const result=await beginUpload(user,body);
      assert.equal(result.status,409);assert.equal(result.data.error,"INSUFFICIENT_PROCESSING_BALANCE");assert.equal(result.data.available,2);assert.equal(result.data.selected,3);
      for(const table of ["photos","documents","document_upload_batches","document_operations"])
        assert.equal((await query(`select 1 from ${table} where user_id=$1`,[user.id])).rowCount,0);
      assert.deepEqual(await fs.readdir(userUploadsDir),before);
    });

    await t.test("group uploads preserve declared order despite reverse arrival and block structural edits until finish", async () => {
      const user=await owner(),body=uploadBody();await query("update users set free_processing_limit=3 where id=$1",[user.id]);
      const account=(await query("select * from users where id=$1",[user.id])).rows[0];
      const started=await beginUpload(user,body);assert.equal(started.status,200);assert.equal(started.data.targetDocumentId,null);
      assert.equal((await query("select 1 from documents where user_id=$1",[user.id])).rowCount,0);
      for(const index of [2,0,1]) {const result=await uploadItem(user,body,index);assert.equal(result.status,200,JSON.stringify(result.data));}
      const current=(await request(user,`/api/document-uploads/${body.batchId}`)).data;
      assert.deepEqual(current.items.map(i=>i.ordinal),[1,2,3]);assert.deepEqual(current.items.map(i=>i.position),[1,2,3]);
      assert.ok(current.items.every(i=>i.documentId===current.targetDocumentId));
      const d=await detail(user,current.targetDocumentId);assert.equal(d.document.pageCount,3);assert.equal(d.document.availableActions.reorder,false);
      assert.deepEqual(d.pages.map(p=>p.pageId),current.items.map(i=>i.photoId));
      assert.ok(d.pages.every(p=>p.addedFromArchive===false));
      const blocked=await request(user,`/api/documents/${d.document.id}/page-order`,{method:"PUT",body:{operationId:operationId(),expectedVersion:d.document.structureVersion,pageIds:d.pages.map(p=>p.pageId)}});
      assert.equal(blocked.status,409);assert.equal(blocked.data.error,"UPLOAD_BATCH_ACTIVE");
      const finished=await closeUpload(user,body);assert.equal(finished.status,200);assert.equal(finished.data.state,"completed");
      assert.equal((await detail(user,current.targetDocumentId)).document.availableActions.reorder,true);
      const after=(await query("select * from users where id=$1",[user.id])).rows[0];
      for(const key of ["records_processed_total","processing_used","gift_processing_used"])assert.equal(after[key],account[key]);
      assert.equal(Number(after.documents_created_total)-Number(account.documents_created_total),3);
    });

    await t.test("batch and item retries are idempotent, including closed batches and deleted-photo tombstones", async () => {
      const user=await owner(),body=uploadBody("group",1);
      assert.equal((await beginUpload(user,body)).status,200);assert.equal((await beginUpload(user,body)).status,200);
      const changed=structuredClone(body);changed.items[0].name="changed.jpg";
      assert.equal((await beginUpload(user,changed)).data.error,"OPERATION_KEY_REUSED");
      const stored=await uploadItem(user,body,0);assert.equal(stored.status,200);
      assert.equal((await uploadItem(user,body,0)).data.items[0].photoId,stored.data.items[0].photoId);
      assert.equal((await uploadItem(user,body,0,"xyz")).data.error,"UPLOAD_ITEM_CONTENT_CHANGED");
      await closeUpload(user,body);assert.equal((await uploadItem(user,body,0)).status,200);
      const d=await detail(user,stored.data.targetDocumentId);
      const deleted=await request(user,"/api/documents/delete-batch",{method:"POST",body:{operationId:operationId(),documents:[{id:d.document.id,expectedVersion:d.document.structureVersion}]}});
      assert.equal(deleted.status,200,JSON.stringify(deleted.data));
      const repeat=await uploadItem(user,body,0);assert.equal(repeat.status,200);assert.equal(repeat.data.items[0].state,"removed");
      assert.equal((await snapshot(user)).length,0);assert.equal(Number((await query("select documents_created_total from users where id=$1",[user.id])).rows[0].documents_created_total),1);
    });

    await t.test("append keeps existing content, metadata and archive date, and places new slots after original pages", async () => {
      const user=await owner(),p=await photo(user,{title:"Existing",createdAt:"2026-01-01Z"}),l=await location(user,p),before=await snapshot(user);
      const body=uploadBody("append",2,{targetDocumentId:l.documentId,expectedVersion:l.structureVersion});
      assert.equal((await beginUpload(user,body)).status,200);
      assert.equal((await uploadItem(user,body,1)).status,200);assert.equal((await uploadItem(user,body,0)).status,200);await closeUpload(user,body);
      const d=await detail(user,l.documentId);assert.equal(d.document.title,"Existing");assert.equal(d.document.archiveAt,"2026-01-01T00:00:00.000Z");
      const batch=(await request(user,`/api/document-uploads/${body.batchId}`)).data;
      assert.deepEqual(d.pages.map(p=>p.pageId),[p.id,...batch.items.map(i=>i.photoId)]);
      assert.deepEqual((await snapshot(user)).find(row=>row.id===p.id),before[0]);
      const tooMany=uploadBody("append",23,{targetDocumentId:l.documentId,expectedVersion:d.document.structureVersion});
      await query("update users set processing_enabled=true where id=$1",[user.id]);
      assert.equal((await beginUpload(user,tooMany)).data.error,"DOCUMENT_PAGE_LIMIT");
    });

    await t.test("separate upload, cancellation and partial finish never discard stored pages", async () => {
      const user=await owner(),body=uploadBody("separate",3);assert.equal((await beginUpload(user,body)).status,200);
      assert.equal((await uploadItem(user,body,0)).status,200);assert.equal((await uploadItem(user,body,1)).status,200);
      const closed=await closeUpload(user,body);assert.equal(closed.data.state,"partial");assert.equal(closed.data.items[2].state,"cancelled");
      assert.equal((await uploadItem(user,body,2)).data.error,"UPLOAD_BATCH_CLOSED");
      assert.equal((await request(user,"/api/documents")).data.documents.length,2);
      const cancelled=uploadBody("group",2);await beginUpload(user,cancelled);await uploadItem(user,cancelled,0);
      assert.equal((await closeUpload(user,cancelled,"cancel")).data.state,"cancelled");
      assert.equal((await snapshot(user)).length,3);assert.equal((await closeUpload(user,cancelled)).data.state,"cancelled");
    });

    await t.test("upload endpoints require ownership and reject malformed, expired or busy selections", async () => {
      const user=await owner(),foreign=await owner(),body=uploadBody("group",1);
      assert.equal((await beginUpload(null,body)).status,401);await beginUpload(user,body);
      for(const who of [null,foreign]){
        const expected=who?404:401;
        assert.equal((await request(who,`/api/document-uploads/${body.batchId}`)).status,expected);
        assert.equal((await uploadItem(who,body,0)).status,expected);
        assert.equal((await closeUpload(who,body)).status,expected);
      }
      await query("update document_upload_batches set lease_until=now()-interval '1 minute' where id=$1",[body.batchId]);
      assert.equal((await uploadItem(user,body,0)).data.error,"UPLOAD_BATCH_CLOSED");
      assert.equal((await beginUpload(user,body)).data.state,"expired");assert.equal((await closeUpload(user,body)).data.state,"expired");
      for(const invalid of [uploadBody("group",26),{...uploadBody(),mode:"replace"},{...uploadBody(),items:[]}])assert.equal((await beginUpload(user,invalid)).status,422);
      const duplicate=uploadBody();duplicate.items[1].itemId=duplicate.items[0].itemId;assert.equal((await beginUpload(user,duplicate)).status,422);
      const p=await photo(user,{status:"processing"}),l=await location(user,p);
      assert.equal((await beginUpload(user,uploadBody("append",1,{targetDocumentId:l.documentId,expectedVersion:l.structureVersion}))).data.error,"DOCUMENT_BUSY");
    });

    await t.test("transaction failure after writing an upload rolls back rows, counters and the new file", async () => {
      const user=await owner(),body=uploadBody("group",1);await beginUpload(user,body);
      const before=await fs.readdir(userUploadsDir),account=(await query("select documents_created_total from users where id=$1",[user.id])).rows[0];
      await query(`create function reject_test_upload() returns trigger language plpgsql as $$ begin raise exception 'Synthetic rollback';end $$;
        create trigger reject_test_upload before update on document_upload_items for each row execute function reject_test_upload()`);
      try {assert.equal((await uploadItem(user,body,0)).status,500);} finally {await query("drop trigger reject_test_upload on document_upload_items;drop function reject_test_upload()");}
      assert.deepEqual(await fs.readdir(userUploadsDir),before);assert.equal((await snapshot(user)).length,0);
      assert.deepEqual((await query("select documents_created_total from users where id=$1",[user.id])).rows[0],account);
      assert.equal((await uploadItem(user,body,0)).status,200);
    });

    await t.test("replacement is restricted to error/no-text pages, preserves position and neighbours, retires old files after commit",async()=>{
      const user=await owner(),a=await photo(user,{title:"Header"}),b=await photo(user,{status:"error"}),c=await photo(user);
      const grouped=await merge(user,[a,b,c]),d=await detail(user,grouped.id),before=await snapshot(user);
      const disallowed=uploadBody("replace",1,{targetDocumentId:grouped.id,expectedVersion:d.document.structureVersion,pageId:a.id});
      assert.equal((await beginUpload(user,disallowed)).data.error,"PAGE_REPLACEMENT_NOT_ALLOWED");
      const body=uploadBody("replace",1,{targetDocumentId:grouped.id,expectedVersion:d.document.structureVersion,pageId:b.id});
      assert.equal((await beginUpload(user,body)).status,200);
      const result=await uploadItem(user,body,0);assert.equal(result.status,200,JSON.stringify(result.data));await closeUpload(user,body);
      const after=await detail(user,grouped.id);assert.equal(after.document.pageCount,3);assert.equal(after.document.title,"Header");
      assert.deepEqual(after.pages.map(p=>p.pageId),[a.id,result.data.items[0].photoId,c.id]);
      assert.equal(await exists(b.storage_path),false);assert.equal((await snapshot(user)).some(p=>p.id===b.id),false);
      for(const id of [a.id,c.id])assert.deepEqual((await snapshot(user)).find(p=>p.id===id),before.find(p=>p.id===id));
      assert.equal((await uploadItem(user,body,0)).data.items[0].photoId,result.data.items[0].photoId);
      const standalone=await photo(user,{status:"no_text"}),l=await location(user,standalone);
      const single=uploadBody("replace",1,{targetDocumentId:l.documentId,expectedVersion:l.structureVersion,pageId:standalone.id});
      await beginUpload(user,single);assert.equal((await uploadItem(user,single,0)).status,200);await closeUpload(user,single);
      assert.equal((await detail(user,l.documentId)).document.pageCount,1);
    });

    await t.test("failed replacement keeps the old image, page, metadata and accounting intact",async()=>{
      const user=await owner(),p=await photo(user,{status:"error"}),l=await location(user,p);
      const body=uploadBody("replace",1,{targetDocumentId:l.documentId,expectedVersion:l.structureVersion,pageId:p.id});await beginUpload(user,body);
      const before=await snapshot(user),files=await fs.readdir(userUploadsDir),account=(await query("select * from users where id=$1",[user.id])).rows[0];
      await query(`create function reject_test_replacement() returns trigger language plpgsql as $$ begin raise exception 'Synthetic replacement rollback';end $$;
        create trigger reject_test_replacement before delete on photos for each row execute function reject_test_replacement()`);
      try{assert.equal((await uploadItem(user,body,0)).status,409);}finally{await query("drop trigger reject_test_replacement on photos;drop function reject_test_replacement()");}
      assert.deepEqual(await snapshot(user),before);assert.deepEqual(await fs.readdir(userUploadsDir),files);
      assert.deepEqual((await query("select * from users where id=$1",[user.id])).rows[0],account);
      assert.equal((await detail(user,l.documentId)).document.structureVersion,l.structureVersion);
    });

    await t.test("adding archived singles to a group is free, versioned, chronological and preserves the common header/date",async()=>{
      const user=await owner(),a=await photo(user,{title:"Original",createdAt:"2026-01-01Z"}),b=await photo(user),
        c=await photo(user,{createdAt:"2026-03-01Z"}),d=await photo(user,{createdAt:"2026-02-01Z"});
      const grouped=await merge(user,[a,b]),target=await detail(user,grouped.id),sources=await Promise.all([c,d].map(p=>location(user,p)));
      await query("update users set free_processing_limit=0 where id=$1",[user.id]);
      const before=await snapshot(user),account=(await query("select * from users where id=$1",[user.id])).rows[0];
      const body={operationId:operationId(),expectedVersion:target.document.structureVersion,sources:sources.map(l=>({documentId:l.documentId,expectedVersion:l.structureVersion}))};
      const result=await request(user,`/api/documents/${grouped.id}/append-from-archive`,{method:"POST",body});assert.equal(result.status,200);
      const after=await detail(user,grouped.id);assert.deepEqual(after.pages.map(p=>p.pageId),[a.id,b.id,d.id,c.id]);
      assert.ok(after.pages.every(p=>p.addedFromArchive===true));
      assert.equal(after.document.title,"Original");assert.equal(after.document.archiveAt,target.document.archiveAt);
      assert.deepEqual(await snapshot(user),before);assert.deepEqual((await query("select * from users where id=$1",[user.id])).rows[0],account);
      assert.deepEqual((await request(user,`/api/documents/${grouped.id}/append-from-archive`,{method:"POST",body})).data,result.data);
      assert.equal((await location(user,c)).documentId,grouped.id);
      const single=await photo(user),sl=await location(user,single);
      const blocked={operationId:operationId(),expectedVersion:sl.structureVersion,sources:[{documentId:grouped.id,expectedVersion:after.document.structureVersion}]};
      assert.equal((await request(user,`/api/documents/${sl.documentId}/append-from-archive`,{method:"POST",body:blocked})).data.error,"MULTIPAGE_MERGE_NOT_SUPPORTED");
    });

    await t.test("archive provenance survives reload and migration restores both merge and append receipts",async()=>{
      const user=await owner(),a=await photo(user,{createdAt:"2026-01-01Z"}),b=await photo(user,{createdAt:"2026-02-01Z"});
      const grouped=await merge(user,[a,b]);
      const original=await photo(user),incoming=await photo(user),target=await location(user,original),source=await location(user,incoming);
      const appended=await request(user,`/api/documents/${target.documentId}/append-from-archive`,{method:"POST",body:{operationId:operationId(),expectedVersion:target.structureVersion,sources:[{documentId:source.documentId,expectedVersion:source.structureVersion}]}});
      assert.equal(appended.status,200);
      assert.deepEqual((await detail(user,target.documentId)).pages.map(p=>p.addedFromArchive),[false,true]);
      await query("update document_pages set added_from_archive=false where user_id=$1",[user.id]);
      await query(await fs.readFile(new URL("../db/migrations/050_document_page_archive_origin.sql",import.meta.url),"utf8"));
      assert.deepEqual((await detail(user,grouped.id)).pages.map(p=>p.addedFromArchive),[true,true]);
      assert.deepEqual((await detail(user,target.documentId)).pages.map(p=>p.addedFromArchive),[false,true]);
    });

    await t.test("processing rechecks current balance and busy state under exclusive account access without provider calls",async()=>{
      const user=await owner(),stored=await photo(user),pending=await photo(user,{status:"uploaded"}),running=await photo(user,{status:"processing"});
      await query("update users set free_processing_limit=0 where id=$1",[user.id]);
      assert.equal((await request(user,`/api/photos/${stored.filename}/process`,{method:"POST",body:{}})).status,200);
      assert.equal((await request(user,`/api/photos/${pending.filename}/process`,{method:"POST",body:{}})).data.error,"USER_RECORD_LIMIT_REACHED");
      assert.equal((await request(user,`/api/photos/${running.filename}/process`,{method:"POST",body:{}})).data.error,"DOCUMENT_BUSY");
      const release=await acquireAccountOperationLock(user.id);
      try{assert.equal((await request(user,`/api/photos/${pending.filename}/process`,{method:"POST",body:{}})).data.error,"ACCOUNT_BUSY");}finally{await release();}
      assert.equal((await query("select status from photos where id=$1",[pending.id])).rows[0].status,"uploaded");
      assert.equal((await query("select records_processed_total from users where id=$1",[user.id])).rows[0].records_processed_total,0);
    });

    await t.test("account cascade removes containers, aliases, receipts and pages together", async () => {
      const user=await owner(),a=await photo(user),b=await photo(user);await merge(user,[a,b]);
      await query("delete from users where id=$1",[user.id]);
      for(const table of ["photos","documents","document_pages","document_aliases","document_operations"])
        assert.equal((await query(`select 1 from ${table} where user_id=$1`,[user.id])).rowCount,0);
    });
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await closeFileIntentLocks();await closeAccountOperationLocks();await closeDatabaseConnection();
    await admin.query(`drop schema if exists ${schema} cascade`);await admin.end();
    assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith("myworld-multipage-"));
    await fs.rm(root,{recursive:true,force:true});
  }
});
