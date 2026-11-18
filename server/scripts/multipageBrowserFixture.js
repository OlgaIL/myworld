// Disposable browser integration fixture. It never starts the production app,
// uses a verified local database/schema, and substitutes all recognition.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import dotenv from "dotenv";
import pg from "pg";
import express from "express";

const config=dotenv.parse(await fs.readFile(new URL("../.env",import.meta.url))),url=new URL(config.DATABASE_URL);
assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
const schema=`multipage_browser_${crypto.randomBytes(10).toString("hex")}`,root=await fs.mkdtemp(path.join(os.tmpdir(),"myworld-multipage-browser-"));
const admin=new pg.Client({connectionString:url.href});await admin.connect();await admin.query(`create schema ${schema}`);
url.searchParams.set("options",`-c search_path=${schema}`);
Object.assign(process.env,{DATABASE_URL:url.href,DATABASE_SSL:"false",NODE_ENV:"test",MYWORLD_TEST_UPLOADS_DIR:root,
  PROCESSING_ENABLED:"false",GOOGLE_CLOUD_PROJECT:"synthetic",METADATA_SERVER_DETECTION:"none",GCE_METADATA_HOST:"127.0.0.1:9"});
for(const key of ["OPENAI_API_KEY","YANDEX_API_KEY","YANDEX_FOLDER_ID","TIMEWEB_API_KEY","GOOGLE_APPLICATION_CREDENTIALS","SMTP_PASSWORD","TELEGRAM_BOT_TOKEN","YOOKASSA_SECRET_KEY"])process.env[key]="";
globalThis.__myworldEnvLoaded=true;
const {query,closeDatabaseConnection}=await import("../db/index.js");
for(const file of (await fs.readdir(new URL("../db/migrations/",import.meta.url))).filter(f=>f.endsWith(".sql")).sort())await query(await fs.readFile(new URL(`../db/migrations/${file}`,import.meta.url),"utf8"));
const {ensurePrivateUploadDirectories,userUploadsDir}=await import("../config/paths.js");ensurePrivateUploadDirectories();
const {createPhoto,updatePhotoProcessingResultAndRecordSuccess}=await import("../repositories/photosRepository.js");
const {mapUserForSession}=await import("../repositories/usersRepository.js");
const {getUserProductAccess,mapPhotoInfo}=await import("../utils/photos.js");
const documents=await import("../services/documentService.js");
const {withAccountOperation,closeAccountOperationLocks}=await import("../services/accountOperationLocks.js");
const {closeFileIntentLocks}=await import("../repositories/guestFileIntentsRepository.js");
const user=(await query("insert into users(display_name,email,free_processing_limit,legal_version,legal_accepted_at) values('Учебная проверка','multipage@example.test',5,'2026-07-15',now()) returning *")).rows[0];
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS6kAAAAASUVORK5CYII=","base64");
const work=new URL("../../work/multipage-2026-11-16/",import.meta.url);await fs.writeFile(new URL("fixture-upload.png",work),png);
const table={blocks:[{type:"table",tableId:"table-1",headers:["Этап","Сумма, ₽"],rows:[["Подготовка","5 000"],["Результат","10 000"]]}]};
async function seed(title,text,{tables=false,status="processed"}={}){
  const filename=`${crypto.randomUUID()}.png`,storagePath=path.join(userUploadsDir,filename);await fs.writeFile(storagePath,png);
  const p=await createPhoto({userId:user.id,filename,storagePath,mimeType:"image/png",sizeBytes:png.length,status,title,summary:`Краткая аннотация: ${title}.`,
    cleanText:text,ocrText:text,formattedContent:{blocks:[{type:"heading",text:title},{type:"paragraph",text},...(tables?[{type:"table_source",tableId:"table-1",text:"Этапы оплаты"}]:[])]},hasTable:tables});
  if(tables)await query("update photos set table_status='ready',table_content=$2::jsonb where id=$1",[p.id,JSON.stringify(table)]);
  return p;
}
const first=await seed("1. Предмет договора","Исполнитель оказывает услуги. Заказчик принимает результат."),second=await seed("2. Порядок расчётов","Оплата после подписания акта.",{tables:true}),third=await seed("Подписи сторон","Заказчик: __________\nИсполнитель: __________");
await seed("Акт выполненных работ","Работы выполнены в полном объёме.");await seed("Приложение к договору","Срок выполнения — 10 рабочих дней.");
await seed("Фото с ошибкой","",{status:"error"});
const locations=await Promise.all([first,second,third].map(p=>documents.getPageLocation(user.id,p.filename)));
await documents.mergeDocuments(user.id,{operationId:crypto.randomUUID(),sources:locations.map(l=>({documentId:l.documentId,expectedVersion:l.structureVersion})),orderedPageIds:[first.id,second.id,third.id]});
const image=title=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="470"><rect width="360" height="470" fill="white"/><text x="22" y="48" font-family="Arial" font-size="13">Учебный документ</text><text x="22" y="78" font-family="Arial" font-size="11">${String(title).replace(/[<>&]/g,"")}</text>${Array.from({length:17},(_,i)=>`<path d="M22 ${115+i*16}h290" stroke="#98a2b3"/>`).join("")}</svg>`)}`;
const app=express();app.use((req,res,next)=>{res.setHeader("Access-Control-Allow-Origin","http://localhost:5173");res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,PATCH,DELETE,OPTIONS");if(req.method==="OPTIONS")return res.sendStatus(204);next();});app.use(express.json());
app.use(async(req,res,next)=>{req.user=mapUserForSession((await query("select * from users where id=$1",[user.id])).rows[0]);next();});
app.get("/api/me",async(req,res)=>{const counts=(await query("select count(*)::int as count from documents where user_id=$1",[user.id])).rows[0];res.json({...req.user,...getUserProductAccess(req.user,req.user.recordsProcessedTotal),processingAllowed:true,documentsStored:counts.count});});
app.get("/api/auth-providers",(req,res)=>res.json([]));app.post("/api/analytics/identity",(req,res)=>res.json({ok:true}));
app.get("/api/guest/document",(req,res)=>res.json({documents:[],document:null,access:{documentLimit:3,documentsUsed:0,documentsRemaining:3,uploadAllowed:true}}));
app.get("/api/public-limits",(req,res)=>res.json({guestProcessingLimit:3,freeProcessingLimit:5}));
app.get("/api/documents",async(req,res)=>res.json({documents:(await documents.listDocuments(user.id)).map(d=>({...d,coverUrl:image(d.title)}))}));
app.get("/api/documents/:id",async(req,res,next)=>{try{const d=await documents.getDocument(user.id,req.params.id);res.json({...d,pages:d.pages.map(p=>({...p,url:image(p.title)}))});}catch(e){next(e);}});
app.get("/api/photos-metadata",async(req,res)=>{const rows=(await query("select * from photos where user_id=$1 order by created_at desc",[user.id])).rows;res.json(rows.map(p=>({...mapPhotoInfo(p),url:image(p.title)})));});
app.post("/api/photos/:id/process",withAccountOperation(async(req,res)=>{
  const p=(await query("select * from photos where filename=$1 and user_id=$2",[req.params.id,user.id])).rows[0];
  if(!p)return res.status(404).json({error:"PHOTO_NOT_FOUND"});if(p.status==="processed")return res.json({status:"processed"});
  const access=getUserProductAccess(req.user,req.user.recordsProcessedTotal);if(!access.totalRemaining)return res.status(403).json({error:"USER_RECORD_LIMIT_REACHED"});
  const updated=await updatePhotoProcessingResultAndRecordSuccess({id:p.id,userId:user.id,updates:{status:"processed",title:"Новая учебная страница",summary:"Добавлена при проверке загрузки.",cleanText:"Новый текст учебной страницы.",ocrText:"Новый текст учебной страницы.",formattedContent:{blocks:[{type:"paragraph",text:"Новый текст учебной страницы."}]},processedAt:new Date()}});res.json({status:updated.status});
},{exclusive:true}));
for(const route of ["documentRoutes","documentUploadRoutes","photoRoutes","improvementRequestRoutes","authRoutes"])app.use((await import(`../routes/${route}.js`)).default);
app.use((error,req,res,next)=>{console.error({fixtureError:error.code||error.message});res.status(error.status||500).json({error:error.code||"FIXTURE_ERROR"});});
const server=await new Promise(resolve=>{const s=app.listen(4017,"127.0.0.1",()=>resolve(s));});
console.log("Synthetic multipage fixture ready on 127.0.0.1:4017. Recognition is stubbed; real archive untouched.");
await fs.writeFile(new URL("browser-fixture.json",work),JSON.stringify({port:4017,schema,userId:user.id}));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await new Promise(resolve=>server.close(resolve));await closeFileIntentLocks();await closeAccountOperationLocks();await closeDatabaseConnection();await admin.query(`drop schema ${schema} cascade`);await admin.end();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith("myworld-multipage-browser-"));await fs.rm(root,{recursive:true,force:true});process.exit(0);}
process.on("SIGINT",stop);process.on("SIGTERM",stop);process.stdin.setEncoding("utf8");process.stdin.on("data",data=>{if(data.includes("stop"))stop();});
