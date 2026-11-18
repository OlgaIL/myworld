import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import dotenv from "dotenv";
import pg from "pg";
const config=dotenv.parse(await fs.readFile(new URL("../.env",import.meta.url))),url=new URL(config.DATABASE_URL);
assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
const file=new URL("../../work/multipage-2026-11-16/browser-fixture.json",import.meta.url),fixture=JSON.parse(await fs.readFile(file,"utf8"));
assert.match(fixture.schema,/^multipage_browser_[a-f0-9]{20}$/);
const alive=await fetch("http://127.0.0.1:4017/api/auth-providers").then(()=>true,()=>false);assert.equal(alive,false,"FIXTURE_STILL_RUNNING");
const client=new pg.Client({connectionString:url.href});await client.connect();
try{
  const exists=(await client.query("select 1 from pg_namespace where nspname=$1",[fixture.schema])).rowCount;
  if(exists){
    const rows=(await client.query(`select storage_path from ${fixture.schema}.photos`)).rows;
    const roots=[...new Set(rows.map(row=>path.resolve(path.dirname(path.dirname(row.storage_path)))))];
    for(const root of roots){assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^myworld-multipage-browser-[a-zA-Z0-9_-]+$/);assert.equal(await fs.realpath(root),root);}
    await client.query(`drop schema ${fixture.schema} cascade`);
    for(const root of roots)await fs.rm(root,{recursive:true,force:true});
  }
  await fs.unlink(file);console.log("Only disposable browser fixture data removed.");
}finally{await client.end();}
