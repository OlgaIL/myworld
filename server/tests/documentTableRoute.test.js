import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import { buildGoogleOcrLayout } from "../utils/ocrLayout.js";

dotenv.config({ quiet: true });
process.env.TABLE_PAGE_INVENTORY_ENABLED="false";
const baseUrl = process.env.DATABASE_URL;
const databaseHost = baseUrl ? new URL(baseUrl).hostname : "";
const localOnly = ["localhost", "127.0.0.1", "[::1]"].includes(databaseHost);

test("tables route: free failed attempt preserves trial, used trial locks, package and saved table remain accessible", { skip: !localOnly }, async () => {
  const schema = `table_synthetic_${crypto.randomBytes(6).toString("hex")}`;
  const databaseUrl = new URL(baseUrl);
  databaseUrl.searchParams.set("options", `-csearch_path=${schema}`);
  const admin = new pg.Client({ connectionString: baseUrl, ssl: false });
  let appServer;
  let closeDatabaseConnection;
  let closeAccountOperationLocks;
  let providerServer, syntheticImage;
  let providerCalls = 0;
  let providerContent = null;
  const providerRequests = [];
  await admin.connect();
  try {
    await admin.query(`create schema ${schema}`);
    const schemaDb = new pg.Client({ connectionString: databaseUrl.href, ssl: false });
    await schemaDb.connect();
    try {
      const migrations = new URL("../db/migrations/", import.meta.url);
      for (const name of (await fs.readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
        await schemaDb.query(await fs.readFile(new URL(name, migrations), "utf8"));
      }
      process.env.DATABASE_URL = databaseUrl.href;
      providerServer = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        providerRequests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        providerCalls++;
        res.writeHead(providerContent === null ? 503 : 200, { "content-type": "application/json" });
        res.end(JSON.stringify(providerContent === null ? { error: { message: "Synthetic temporary outage" } }
          : { choices: [{ finish_reason: "stop", message: { content: typeof providerContent === "function"
            ? providerContent(providerRequests.at(-1)) : providerContent } }] }));
      });
      await new Promise((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
      process.env.TIMEWEB_AI_ENABLED = "true"; process.env.TIMEWEB_API_KEY = "synthetic";
      process.env.TIMEWEB_MODEL = "openai/gpt-4.1-mini";
      process.env.TIMEWEB_BASE_URL = `http://127.0.0.1:${providerServer.address().port}/v1`;
      const express = (await import("express")).default;
      const db = await import("../db/index.js");
      closeDatabaseConnection = db.closeDatabaseConnection;
      closeAccountOperationLocks = (await import("../services/accountOperationLocks.js")).closeAccountOperationLocks;
      const app = express();
      app.use((req, _res, next) => {
        const id = Number(req.headers["x-test-user"]);
        if (id) req.user = { id };
        next();
      });
      app.use((await import("../routes/photoRoutes.js")).default);
      const { userUploadsDir } = await import("../config/paths.js");
      syntheticImage = path.join(userUploadsDir, `${schema}.png`);
      await fs.mkdir(userUploadsDir, { recursive: true });
      await fs.writeFile(syntheticImage, "synthetic-image");
      appServer = await new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => resolve(server));
      });
      const user = (await schemaDb.query(
        "insert into users (google_id, email, display_name, processing_quota) values ('gift', 'gift@example.test', 'Gift', 1) returning id"
      )).rows[0];
      const other = (await schemaDb.query(
        "insert into users (google_id, email, display_name) values ('free', 'free@example.test', 'Free') returning id"
      )).rows[0];
      const { mapUserForSession } = await import("../repositories/usersRepository.js");
      assert.equal(mapUserForSession((await schemaDb.query("select * from users where id = $1", [other.id])).rows[0]).tableTrialAvailable, true);
      const photo = (await schemaDb.query(
        `insert into photos (user_id, filename, storage_path, status, has_table, ocr_text, mime_type)
         values ($1, 'synthetic-table.jpg', $2, 'processed', true, 'Таблица 1', 'image/jpeg') returning id`,
        [user.id, syntheticImage]
      )).rows[0];
      const layout = buildGoogleOcrLayout({ textAnnotations: [{ description: "Таблица 1" },
        { description: "Таблица", boundingPoly: { vertices: [{ x: 1, y: 1 }, { x: 10, y: 10 }] } }] }, Buffer.from("synthetic-image"), "Таблица 1");
      await schemaDb.query("insert into document_ocr_layouts (photo_id, artifact) values ($1, $2::jsonb)", [photo.id, JSON.stringify(layout)]);
      const endpoint = `http://127.0.0.1:${appServer.address().port}/api/photos/synthetic-table.jpg/tables`;
      assert.equal((await fetch(endpoint, { method: "POST" })).status, 401);
      assert.equal((await fetch(endpoint, { method: "POST", headers: { "x-test-user": other.id } })).status, 404);
      await schemaDb.query("update photos set user_id = $1 where id = $2", [other.id, photo.id]);
      const freeAttempt = await fetch(endpoint, { method: "POST", headers: { "x-test-user": other.id } });
      assert.equal(freeAttempt.status, 200);
      assert.equal((await freeAttempt.json()).tableErrorCode, "TABLE_PROVIDER_UNAVAILABLE");
      assert.equal((await schemaDb.query("select table_trial_used_at from users where id = $1", [other.id])).rows[0].table_trial_used_at, null);
      await schemaDb.query("update users set table_trial_used_at = now() where id = $1", [other.id]);
      assert.equal(mapUserForSession((await schemaDb.query("select * from users where id = $1", [other.id])).rows[0]).tableTrialAvailable, false);
      const locked = await fetch(endpoint, { method: "POST", headers: { "x-test-user": other.id } });
      assert.equal(locked.status, 403);
      assert.equal((await locked.json()).error, "TABLE_PACKAGE_REQUIRED");
      await schemaDb.query("update photos set user_id = $1 where id = $2", [user.id, photo.id]);
      const countersBefore = (await schemaDb.query(
        "select processing_used, records_processed_total from users where id = $1", [user.id]
      )).rows[0];
      const attempted = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(attempted.status, 200);
      assert.equal((await attempted.json()).tableErrorCode, "TABLE_PROVIDER_UNAVAILABLE");
      await schemaDb.query(
        "update photos set status = 'recognized', has_table = false, ocr_text = $2 where id = $1",
        [photo.id, 'Таблица 1 – Проверка\nНаименование 2027 г.']
      );
      const ocrOnly = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(ocrOnly.status, 409);
      const ocrOnlyInfo = await ocrOnly.json();
      assert.equal(ocrOnlyInfo.error, "TABLE_DOCUMENT_NOT_READY");
      assert.equal(ocrOnlyInfo.info.status, "recognized");
      assert.equal(providerCalls, 2);
      assert.equal((await schemaDb.query("select table_attempts from photos where id=$1",[photo.id])).rows[0].table_attempts,2);
      await schemaDb.query("update photos set status='processed' where id=$1",[photo.id]);
      const afterEnrichment = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(afterEnrichment.status, 200);
      assert.equal((await afterEnrichment.json()).tableErrorCode, "TABLE_PROVIDER_UNAVAILABLE");
      const overLimit = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(overLimit.status, 409);
      const limitInfo = await overLimit.json();
      assert.equal(limitInfo.error, "TABLE_ATTEMPT_LIMIT");
      assert.equal(limitInfo.info.tableAttempts, 3);
      assert.equal(limitInfo.info.tableAttemptsRemaining, 0);
      assert.equal((await schemaDb.query("select table_attempts from photos where id = $1", [photo.id])).rows[0].table_attempts, 3);
      assert.equal((await schemaDb.query("select count(*)::int as n from table_processing_attempts where outcome = 'failure'")).rows[0].n, 3);
      assert.deepEqual((await schemaDb.query(
        "select processing_used, records_processed_total from users where id = $1", [user.id]
      )).rows[0], countersBefore);
      assert.equal((await schemaDb.query("select count(*)::int as n from llm_attempt_events")).rows[0].n, 3);
      assert.equal(providerCalls, 3);
      await schemaDb.query("update photos set table_status = 'review', table_error_code = 'TABLE_INVALID_STRUCTURE', table_attempts = 1 where id = $1", [photo.id]);
      const noBlindRetry = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(noBlindRetry.status, 409);
      assert.equal((await noBlindRetry.json()).info.tableRetryable, false);
      assert.equal(providerCalls, 3);
      await schemaDb.query(
        `update photos set table_status = 'ready', table_content =
          '{"blocks":[{"type":"table","headers":["A","B","C"],"rows":[["x","1","2"]]}]}'::jsonb
         where id = $1`, [photo.id]
      );
      await schemaDb.query("update users set processing_quota = 0 where id = $1", [user.id]);
      const cached = await fetch(endpoint, { method: "POST", headers: { "x-test-user": user.id } });
      assert.equal(cached.status, 200);
      assert.equal((await cached.json()).tableContent.blocks[0].rows[0][1], "1");
      const metadata = await fetch(`http://127.0.0.1:${appServer.address().port}/api/photos-metadata`,
        { headers: { "x-test-user": user.id } });
      assert.equal((await metadata.json())[0].tableContent, null);
      const reopened = await fetch(endpoint, { headers: { "x-test-user": user.id } });
      assert.equal((await reopened.json()).tableContent.blocks[0].rows[0][2], "2");
      assert.equal((await schemaDb.query("select count(*)::int as n from table_processing_attempts")).rows[0].n, 3);
      const concurrentPhoto = (await schemaDb.query(
        "insert into photos (user_id, filename, storage_path, status, has_table) values ($1, 'parallel.jpg', 'none', 'processed', true) returning id", [user.id]
      )).rows[0];
      const { reserveTableAttempt, finishTableAttempt, getTableAttemptSummary } = await import("../services/tableAttemptService.js");
      const reservations = await Promise.all(Array.from({ length: 5 }, () => reserveTableAttempt(concurrentPhoto.id, user.id)));
      const reserved = reservations.filter(Boolean);
      assert.equal(reserved.length, 3);
      await finishTableAttempt(reserved[0].id, { status: "ready" }, 10);
      const summary = await getTableAttemptSummary(24);
      assert.deepEqual(summary, { hours: 24, attempts: 6, successes: 1, failures: 3, pending: 2, unfinished: 0,
        models:[{model:"openai/gpt-4.1-mini",provider:"timeweb",calls:3,inputTokens:0,outputTokens:0,estimatedCostRub:null,unknownCostCalls:3}] });

      // A fresh document can take one specific format repair, never a model
      // carousel. All network requests terminate at the synthetic local server.
      await schemaDb.query("update users set processing_quota = 1 where id = $1", [user.id]);
      const word = (description, x, y) => ({ description, boundingPoly: { vertices: [{ x, y }, { x: x + 30, y: y + 10 }] } });
      const grid = [{ description: "Name Value Alpha 100 Beta 200" }, word("Name", 30, 40), word("Value", 140, 40),
        word("Alpha", 30, 80), word("100", 140, 80), word("Beta", 30, 110), word("200", 140, 110)];
      const gridLayout = buildGoogleOcrLayout({ textAnnotations: grid }, Buffer.from("synthetic-image"), grid[0].description);
      const validTable = { title: "", headers: ["Name", "Value"], rows: [["Alpha", "100"], ["Beta", "200"]] };
      const brokenTable = { ...validTable, rows: [["Alpha", 100], ["Beta", "200"]] };
      for (const recover of [true, false]) {
        const filename = `format-${recover}.jpg`;
        const fresh = (await schemaDb.query(`insert into photos
          (user_id, filename, storage_path, status, has_table, ocr_text, mime_type, formatted_content)
          values ($1,$2,$3,'processed',true,$4,'image/jpeg',$5::jsonb) returning id`,
        [user.id, filename, syntheticImage, grid[0].description,
          JSON.stringify({ blocks: [{ type: "table_source", tableId: "table-1", text: grid[0].description }] })])).rows[0];
        await schemaDb.query("insert into document_ocr_layouts (photo_id, artifact) values ($1,$2::jsonb)", [fresh.id, JSON.stringify(gridLayout)]);
        const freshEndpoint = `http://127.0.0.1:${appServer.address().port}/api/photos/${filename}/tables`;
        const post = () => fetch(freshEndpoint, { method: "POST", headers: { "x-test-user": user.id } });
        const before = providerCalls;
        providerContent = JSON.stringify({ tables: [brokenTable] });
        const failed = await post();
        assert.equal(failed.status, 200);
        const failedInfo = await failed.json();
        assert.equal(failedInfo.tableNextAction, "repair_format");
        assert.equal(failedInfo.tableRetryable, true);
        assert.equal(JSON.stringify(failedInfo).includes("CELL_TYPE"), false);
        assert.equal(providerCalls, before + 1);
        const event = (await schemaDb.query("select model,validation_diagnostic from table_processing_attempts where photo_id = $1", [fresh.id])).rows[0];
        assert.equal(event.model, "openai/gpt-4.1-mini");
        assert.equal(event.validation_diagnostic.reason, "CELL_TYPE");
        providerContent = JSON.stringify({ tables: [recover ? validTable : brokenTable] });
        const repaired = await post();
        assert.equal(repaired.status, 200);
        const repairedInfo = await repaired.json();
        assert.equal(providerCalls, before + 2);
        assert.equal(providerRequests.at(-1).model, "openai/gpt-4.1-mini");
        assert.match(providerRequests.at(-1).messages[1].content[0].text, /Каждая ячейка должна быть строкой/u);
        if (recover) {
          assert.equal(repairedInfo.tableStatus, "ready");
          assert.equal((await post()).status, 200);
        } else {
          assert.equal(repairedInfo.tableRetryable, false);
          assert.equal(repairedInfo.tableNextAction, "review_format");
          assert.equal((await post()).status, 409);
        }
        assert.equal(providerCalls, before + 2);
      }
      // Real image grid -> page inventory -> two isolated tables, all within one
      // user attempt. Only the local synthetic HTTP provider is reachable.
      process.env.TABLE_PAGE_INVENTORY_ENABLED="true";
      const sharp=(await import("sharp")).default;
      const width=220,height=250,pixels=Buffer.alloc(width*height,255);
      const gridAnnotations=[{description:"Group of two tables"}],splitTables=[];
      for(let index=0;index<2;index++){
        const xs=[20,110,200],ys=[20,50,80,110].map(y=>y+120*index);
        for(const x of xs)for(let y=ys[0];y<=ys.at(-1);y++)pixels[y*width+x]=0;
        for(const y of ys)for(let x=xs[0];x<=xs.at(-1);x++)pixels[y*width+x]=0;
        const headers=[`Name${index}`,`Value${index}`],rows=[[`Alpha${index}`,`${index+1}00`],[`Beta${index}`,`${index+1}50`]];
        [headers,...rows].forEach((row,r)=>row.forEach((text,c)=>{
          gridAnnotations.push(word(text,35+c*90,ys[r]+8));
        }));
        splitTables.push({title:"",headers,rows,gridId:`grid-${index+1}`,sourceRows:[2,3]});
      }
      const splitImage=await sharp(pixels,{raw:{width,height,channels:1}}).png().toBuffer();
      await fs.writeFile(syntheticImage,splitImage);
      const splitLayout=buildGoogleOcrLayout({textAnnotations:gridAnnotations},splitImage,gridAnnotations[0].description);
      const splitPhoto=(await schemaDb.query(`insert into photos
        (user_id,filename,storage_path,status,has_table,ocr_text,mime_type,formatted_content)
        values ($1,'split-tables.png',$2,'processed',true,$3,'image/png',$4::jsonb) returning id`,
      [user.id,syntheticImage,splitLayout.text,JSON.stringify({blocks:[{type:"table_source",tableId:"table-1",text:"Both tables"}]})])).rows[0];
      await schemaDb.query("insert into document_ocr_layouts (photo_id,artifact) values ($1,$2::jsonb)",[splitPhoto.id,JSON.stringify(splitLayout)]);
      providerContent=request=>request.messages[0].content.includes('"regions"')
        ? JSON.stringify({regions:[{box:[20/width*1000,20/height*1000,200/width*1000,110/height*1000]},
          {box:[20/width*1000,140/height*1000,200/width*1000,230/height*1000]}]})
        : JSON.stringify({tables:[splitTables[request.messages[1].content[0].text.includes("ОДНОЙ таблицы 2 из 2")?1:0]]});
      const callsBeforeSplit=providerCalls;
      const eventsBeforeSplit=(await schemaDb.query("select count(*)::int as n from llm_attempt_events")).rows[0].n;
      const splitResponse=await fetch(`http://127.0.0.1:${appServer.address().port}/api/photos/split-tables.png/tables`,
        {method:"POST",headers:{"x-test-user":user.id}});
      assert.equal(splitResponse.status,200);
      const splitInfo=await splitResponse.json();
      assert.equal(splitInfo.tableStatus,"ready");
      assert.equal(splitInfo.tableContent.blocks.filter(b=>b.type==="table").length,2);
      assert.equal(splitInfo.tableAttempts,1);assert.equal(providerCalls,callsBeforeSplit+3);
      const splitEvent=(await schemaDb.query("select model_calls,outcome from table_processing_attempts where photo_id=$1",[splitPhoto.id])).rows[0];
      assert.equal(splitEvent.model_calls,3);assert.equal(splitEvent.outcome,"success");
      assert.equal((await schemaDb.query("select count(*)::int as n from llm_attempt_events")).rows[0].n,eventsBeforeSplit+3);
    } finally {
      await schemaDb.end();
    }
  } finally {
    if (providerServer) await new Promise((resolve) => providerServer.close(resolve));
    if (syntheticImage) await fs.unlink(syntheticImage);
    if (appServer) {
      appServer.closeAllConnections();
      await new Promise((resolve) => appServer.close(resolve));
    }
    if (closeAccountOperationLocks) await closeAccountOperationLocks();
    if (closeDatabaseConnection) await closeDatabaseConnection();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
