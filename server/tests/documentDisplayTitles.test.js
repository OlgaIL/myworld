import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import test from "node:test";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({path:new URL("../.env",import.meta.url),quiet:true});
const databaseUrl = process.env.DATABASE_URL;
const isLocal = databaseUrl && ["localhost","127.0.0.1","[::1]"].includes(new URL(databaseUrl).hostname);

test("persistent display titles: migration, isolation, reprocessing, transfer and concurrent uploads", {skip:!isLocal}, async t => {
  const schema = `title_test_${crypto.randomBytes(8).toString("hex")}`;
  const admin = new pg.Client({connectionString:databaseUrl});
  const url = new URL(databaseUrl);
  url.searchParams.set("options",`-csearch_path=${schema}`);
  const pool = new pg.Pool({connectionString:url.href,max:10});
  await admin.connect();
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(`create table photos(id bigserial primary key,user_id bigint not null,title text,
      created_at timestamptz default now(),clean_text text,formatted_content jsonb);
      create table guest_documents(id bigserial primary key,guest_session_id bigint not null,title text,
      created_at timestamptz default now(),clean_text text,formatted_content jsonb);`);
    await pool.query(`insert into photos(user_id,title,clean_text,formatted_content) values
      (1,'Квитанция','Original content','{"blocks":[]}'),(1,'Квитанция',null,null),
      (1,'Квитанция',null,null),(1,'Квитанция (2)',null,null)`);
    await pool.query(await fs.readFile(new URL("../db/migrations/047_document_display_titles.sql",import.meta.url),"utf8"));
    const photo = async(owner,title) => (await pool.query("insert into photos(user_id,title) values($1,$2) returning *",[owner,title])).rows[0];
    const guest = async(owner,title) => (await pool.query("insert into guest_documents(guest_session_id,title) values($1,$2) returning *",[owner,title])).rows[0];

    await t.test("existing names are numbered in upload order without modifying source titles or content",async()=>{
      const rows=(await pool.query("select * from photos where user_id=1 order by id")).rows;
      assert.deepEqual(rows.map(r=>r.display_title),["Квитанция","Квитанция (2)","Квитанция (3)","Квитанция (2) (2)"]);
      assert.deepEqual(rows.map(r=>r.title),["Квитанция","Квитанция","Квитанция","Квитанция (2)"]);
      assert.equal(rows[0].clean_text,"Original content");
      assert.deepEqual(rows[0].formatted_content,{blocks:[]});
    });
    await t.test("accounts and guest sessions have independent labels, with normalized whitespace and case",async()=>{
      assert.equal((await photo(2,"План")).display_title,"План");
      assert.equal((await photo(2,"  план\n ")).display_title,"план (2)");
      assert.equal((await photo(3,"План")).display_title,"План");
      assert.equal((await guest(2,"План")).display_title,"План");
      assert.equal((await guest(2,"План")).display_title,"План (2)");
      assert.equal((await guest(3,"План")).display_title,"План");
    });
    await t.test("deleting or reprocessing a neighbour never renumbers surviving documents",async()=>{
      const first=await photo(4,"Документ"), second=await photo(4,"Документ"), third=await photo(4,"Документ");
      await pool.query("delete from photos where id=$1",[first.id]);
      const updated=(await pool.query("update photos set title='  ДОКУМЕНТ  ' where id=$1 returning *",[second.id])).rows[0];
      assert.equal(updated.display_title,"Документ (2)");
      assert.equal((await pool.query("select display_title from photos where id=$1",[third.id])).rows[0].display_title,"Документ (3)");
    });
    await t.test("changed model titles get a unique label and empty titles get a readable fallback",async()=>{
      await photo(5,"Отчёт");
      const row=await photo(5,"");
      assert.equal(row.display_title,"Запись");
      assert.equal((await photo(5,null)).display_title,"Запись (2)");
      assert.equal((await pool.query("update photos set title='Отчёт' where id=$1 returning display_title",[row.id])).rows[0].display_title,"Отчёт (2)");
    });
    await t.test("parallel uploads cannot receive the same display title",async()=>{
      const rows=await Promise.all(Array.from({length:10},()=>photo(6,"Параллельная загрузка")));
      assert.equal(new Set(rows.map(r=>r.display_title)).size,10);
      assert.ok(rows.some(r=>r.display_title==="Параллельная загрузка (10)"));
    });
    await t.test("guest labels survive transfer when available and resolve account collisions",async()=>{
      await photo(7,"Заявление");
      const source=await guest(7,"Заявление");
      const moved=(await pool.query("insert into photos(user_id,title,display_title) values(7,$1,$2) returning *",[source.title,source.display_title])).rows[0];
      assert.equal(moved.title,"Заявление");assert.equal(moved.display_title,"Заявление (2)");
      const preserved=(await pool.query("insert into photos(user_id,title,display_title) values(8,$1,$2) returning *",[moved.title,moved.display_title])).rows[0];
      assert.equal(preserved.display_title,"Заявление (2)");
      const {mapPhotoInfo}=await import("../utils/photos.js");
      const {mapGuestDocumentInfo}=await import("../utils/guest.js");
      assert.equal(mapPhotoInfo(moved).title,"Заявление");
      assert.equal(mapPhotoInfo(moved).displayTitle,"Заявление (2)");
      assert.equal(mapGuestDocumentInfo({...source,display_title:"Заявление (3)"}).displayTitle,"Заявление (3)");
    });
  } finally {
    await pool.end();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
});
