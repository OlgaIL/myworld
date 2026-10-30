import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildGoogleOcrLayout } from "../utils/ocrLayout.js";
import { planGridRecovery, cropTableGrid } from "../utils/tableGridRecovery.js";
import { analyzeTableFailure } from "../utils/tableFailureAnalysis.js";
import { extractDocumentTables } from "../services/documentTableService.js";
import { finishTableAttempt } from "../services/tableAttemptService.js";

async function fixture(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"table-split-"));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const width=200,height=260,pixels=Buffer.alloc(width*height*3,255);
  const annotations=[{description:"SOURCE_ONLY_OUTSIDE_CROPS"}];
  const tables=[],grids=[];
  for(let i=0;i<3;i++){
    const top=10+i*80,headers=[`Name${i}`,`Value${i}`],rows=[[`Item${i}`,`${i+1}00`]];
    for(let y=top;y<top+60;y++)for(let x=10;x<190;x++){
      for(let c=0;c<3;c++)pixels[(y*width+x)*3+c]=c===i?200:40;
    }
    const cells=headers.map((text,col)=>({row:0,col,rowSpan:1,colSpan:1,text}));
    const grid={id:`grid-${i+1}`,xs:[10,100,190],ys:[top,top+25,top+60],
      columns:headers.map((text,col)=>({col:col+1,headerPath:[text]})),
      headerStart:0,headerEnd:1,cells,dataRows:[{sourceRow:2,bounds:[top+25,top+60],cells:rows[0]}]};
    grids.push(grid);tables.push({title:"",gridId:grid.id,headers,rows,sourceRows:[2]});
    rows[0].forEach((description,col)=>annotations.push({description,boundingPoly:{vertices:[
      {x:30+col*100,y:top+32},{x:65+col*100,y:top+45}]}}));
  }
  const image=await sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
  const file=path.join(dir,"source.png");await fs.writeFile(file,image);
  const map={version:1,status:"detected",width,height,tables:grids};
  const layout=buildGoogleOcrLayout({textAnnotations:annotations},image,annotations[0].description);
  const photo={storage_path:file,mime_type:"image/png",formatted_content:{blocks:[
    {type:"table_source",tableId:"table-1",text:"The complete group"}]}};
  const requests=[];
  const options={config:{enabled:true,apiKey:"synthetic",baseURL:"https://synthetic.invalid/v1",
    model:"openai/gpt-4.1-mini",timeoutMs:1000,maxTokens:6000,inputRubPerMillion:1,outputRubPerMillion:2,pageInventory:false},
    layout,resolveImage:async()=>file,buildGrid:async()=>map};
  const respond=answer=>({chat:{completions:{create:async request=>{
    requests.push(request);
    const value=await answer(request,requests.length);
    return {choices:[{finish_reason:"stop",message:{content:JSON.stringify({tables:value})}}],
      usage:{prompt_tokens:10,completion_tokens:20}};
  }}}});
  return {map,tables,image,photo,options,requests,respond};
}

test("three grids: keep uniquely checked parts, crop only the missing middle table, preserve output order and account for both calls",async t=>{
  const f=await fixture(t);
  f.options.client=f.respond(async(request,n)=>{
    if(n===1)return [f.tables[2],f.tables[0]];
    const message=request.messages[1].content;
    assert.match(message[0].text,/ОДНОЙ таблицы grid-2/u);
    assert.equal(message[0].text.includes("SOURCE_ONLY_OUTSIDE_CROPS"),false);
    assert.equal(message[0].text.includes('"gridId":"grid-1"'),false);
    assert.equal(message[1].image_url.detail,"high");
    const crop=Buffer.from(message[1].image_url.url.split(",")[1],"base64");
    const {data,info}=await sharp(crop).raw().toBuffer({resolveWithObject:true});
    assert.ok(info.height<80);assert.ok(info.width<200);
    const centre=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*info.channels;
    assert.deepEqual([...data.slice(centre,centre+3)],[40,200,40]);
    return [f.tables[1]];
  });
  const before=structuredClone(f.tables);
  const result=await extractDocumentTables(f.photo,f.options);
  assert.equal(result.status,"ready");assert.equal(f.requests.length,2);
  assert.ok(f.requests.every(r=>r.model==="openai/gpt-4.1-mini"));
  assert.deepEqual(result.content.blocks.filter(b=>b.type==="table").map(b=>b.rows),f.tables.map(t=>t.rows));
  assert.deepEqual(result.content.blocks.filter(b=>b.type==="table").map(b=>b.tablePart),[1,2,3]);
  assert.deepEqual(result.tableContext.recovery,{reused:2,requested:1,completed:1});
  assert.deepEqual(result.tableContext.responses[0],{isolated:false,expected:3,actual:2,columns:[2,2],rows:[1,1]});
  assert.equal(result.modelCalls,2);assert.equal(result.inputTokens,20);assert.equal(result.outputTokens,40);
  assert.equal(result.estimatedCostRub,0.0001);
  assert.deepEqual(result.modelAttempts.map(a=>a.outcome),["error","success"]);
  assert.equal(result.tableContext.phase,"grid_split");assert.deepEqual(f.tables,before);
  await finishTableAttempt(1,result,10,async(_sql,params)=>{
    assert.equal(params[7],2);assert.equal(params[8],20);assert.equal(params[9],40);
  });
});

test("wrong value in a recovered part stops the operation without publishing partial content or retrying again",async t=>{
  const f=await fixture(t),wrong=structuredClone(f.tables[1]);wrong.rows[0][1]="999";
  f.options.client=f.respond((_request,n)=>n===1?[f.tables[0],f.tables[2]]:[wrong]);
  const result=await extractDocumentTables(f.photo,f.options);
  assert.equal(result.code,"CELL_VALUE_MISMATCH");assert.equal(result.content,undefined);
  assert.equal(result.validationDiagnostic.field,"tables[1]");assert.equal(f.requests.length,2);
  assert.equal(analyzeTableFailure(result.status,result.code,result.tableContext).retryable,false);
});

test("duplicates and ambiguous identities are never reused; repair budget is checked before extra calls",async t=>{
  const {tables,map}=await fixture(t);
  assert.deepEqual(planGridRecovery([tables[0],tables[0]],map).pending,[0,1,2]);
  const ambiguous=structuredClone(map);ambiguous.tables[1]={...ambiguous.tables[0],id:"grid-2"};
  const noId={...tables[0]};delete noId.gridId;
  assert.equal(planGridRecovery([noId],ambiguous).kept.filter(Boolean).length,0);
  const large={...map,tables:Array.from({length:5},(_,i)=>({...map.tables[0],id:`grid-${i+1}`}))};
  assert.equal(planGridRecovery([],large),null);
  assert.equal(planGridRecovery([...tables,tables[0]],map),null,"an extra table may indicate an incomplete detected map");
  assert.equal(planGridRecovery([], {status:"none",tables:[]}),null);
});

test("a saved count failure uses isolated grids directly, with one request per grid and no extra whole-page request",async t=>{
  const f=await fixture(t);
  const context={phase:"initial",model:"openai/gpt-4.1-mini",gridEvidence:{status:"detected",columns:[2,2,2]}};
  const photo={...f.photo,table_status:"review",table_error_code:"TABLE_GRID_COUNT_MISMATCH",table_processing_context:context};
  assert.equal(analyzeTableFailure(photo.table_status,photo.table_error_code,context).action,"split_grid");
  f.options.client=f.respond((_request,n)=>[f.tables[n-1]]);
  const result=await extractDocumentTables(photo,f.options);
  assert.equal(result.status,"ready");assert.equal(f.requests.length,3);
  assert.ok(result.tableContext.responses.every(r=>r.isolated));
  assert.deepEqual(result.tableContext.recovery,{reused:0,requested:3,completed:3});
  assert.equal(analyzeTableFailure("review","TABLE_GRID_COUNT_MISMATCH",result.tableContext).retryable,false);
});

test("empty and overcomplete isolated answers fail, and unavailable transport never triggers more model requests",async t=>{
  for(const failure of [[], "transport", "duplicate"]){
    const f=await fixture(t);
    f.options.client=f.respond((_request,n)=>{
      if(n===1)return [f.tables[0],f.tables[2]];
      if(failure==="transport")throw new Error("PRIVATE_PROVIDER_BODY");
      return failure==="duplicate"?[f.tables[1],f.tables[1]]:[];
    });
    const result=await extractDocumentTables(f.photo,f.options);
    assert.equal(result.status,failure==="transport"?"error":"review");
    assert.equal(result.content,undefined);assert.equal(f.requests.length,2);
    assert.equal(JSON.stringify(result).includes("PRIVATE_PROVIDER_BODY"),false);
    assert.equal(result.inputTokens,failure==="transport"?null:20);
  }
});

test("bad crop bounds are rejected without an image or model request",async t=>{
  const f=await fixture(t);
  await assert.rejects(cropTableGrid(f.image,{xs:[],ys:[]}),/GRID_CROP_BOUNDS/u);
});

test("a complete first result remains a single call, and a count failure over budget stops before extra calls",async t=>{
  const f=await fixture(t);
  f.options.client=f.respond(()=>f.tables);
  const complete=await extractDocumentTables(f.photo,f.options);
  assert.equal(complete.status,"ready");assert.equal(complete.modelCalls,1);
  assert.equal(complete.tableContext.recovery,undefined);
  const large={...f.map,tables:Array.from({length:5},(_,i)=>({...f.map.tables[0],id:`grid-${i+1}`}))};
  f.options.buildGrid=async()=>large;f.options.client=f.respond(()=>[]);
  const rejected=await extractDocumentTables(f.photo,f.options);
  assert.equal(rejected.validationDiagnostic.reason,"SPLIT_BUDGET");
  assert.equal(rejected.modelCalls,1);assert.equal(rejected.content,undefined);
  f.options.buildGrid=async()=>f.map;f.options.client=f.respond(()=>[...f.tables,f.tables[0]]);
  const extra=await extractDocumentTables(f.photo,f.options);
  assert.equal(extra.validationDiagnostic.reason,"UNEXPECTED_EXTRA_TABLES");
  assert.equal(extra.modelCalls,1);assert.equal(extra.content,undefined);
});
