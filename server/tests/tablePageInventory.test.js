import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildGoogleOcrLayout } from "../utils/ocrLayout.js";
import { pageTableEvidence,validatePageInventory,validateHeaderRows } from "../utils/tablePageInventory.js";
import { extractDocumentTables } from "../services/documentTableService.js";

async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"inventory-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const width=220,height=300,pixels=Buffer.alloc(width*height,255),annotations=[{}],tables=[],grids=[],regions=[];
  const word=(description,x,y)=>({description,boundingPoly:{vertices:[{x,y},{x:x+35,y:y+8}]}});
  for(let i=0;i<3;i++){
    const xs=[10,110,210],ys=[10,35,60,85].map(y=>y+90*i);
    for(const y of ys)for(let x=xs[0];x<=xs.at(-1);x++)pixels[y*width+x]=0;
    for(const x of xs)for(let y=ys[0];y<=ys.at(-1);y++)if(i<2||y%3===0)pixels[y*width+x]=0;
    const headers=[`Name${i}`,`Value${i}`],rows=[[`Alpha${i}`,`${i+1}00`],[`Beta${i}`,`${i+1}50`]];
    [headers,...rows].forEach((row,r)=>row.forEach((text,c)=>annotations.push(word(text,25+c*100,ys[r]+7))));
    const columns=headers.map((text,c)=>({col:c+1,bounds:[xs[c],xs[c+1]],headerPath:[text]}));
    grids.push({id:`grid-${i+1}`,xs,ys,columns,headerStart:0,headerEnd:1,
      cells:headers.map((text,col)=>({text,row:0,col,rowSpan:1,colSpan:1})),
      dataRows:rows.map((cells,r)=>({sourceRow:r+2,cells,bounds:[ys[r+1],ys[r+2]]}))});
    tables.push({title:"",headers,rows,headerRows:[headers.map((text,col)=>({text,col,colSpan:1,rowSpan:1}))]});
    regions.push({box:[10/width*1000,ys[0]/height*1000,210/width*1000,ys.at(-1)/height*1000],columnCount:2});
  }
  annotations[0].description=annotations.slice(1).map(a=>a.description).join("\n")+"\nNOTICE outside tables";
  annotations.push(word("NOTICE",25,283),word("outside",75,283),word("tables",130,283));
  const image=await sharp(pixels,{raw:{width,height,channels:1}}).png().toBuffer();
  const file=path.join(dir,"three.png");await fs.writeFile(file,image);
  const layout=buildGoogleOcrLayout({textAnnotations:annotations},image,annotations[0].description);
  const map={status:"detected",version:1,width,height,tables:grids.slice(0,2)};
  const requests=[];
  const options={config:{enabled:true,apiKey:"synthetic",model:"openai/gpt-4.1-mini",baseURL:"https://synthetic.invalid/v1",timeoutMs:1000,maxTokens:6000,pageInventory:true},
    resolveImage:async()=>file,layout,buildGrid:async()=>map};
  const photo={storage_path:file,mime_type:"image/png",ocr_text:layout.text};
  const provider=fn=>({chat:{completions:{create:async request=>{
    requests.push(request);const value=fn(request,requests.length);
    return {choices:[{finish_reason:"stop",message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:20}};
  }}}});
  return {image,layout,map,regions,tables,requests,options,photo,provider};
}

test("independent page evidence exposes a third dotted table missed by the full cell-grid detector",async t=>{
  const f=await fixture(t),e=await pageTableEvidence(f.image,f.layout,f.map);
  assert.equal(validatePageInventory({regions:f.regions},e,f.map).length,3);
  assert.throws(()=>validatePageInventory({regions:f.regions.slice(0,2)},e,f.map),/INVENTORY_REGION_MISSING/);
  assert.throws(()=>validatePageInventory({regions:[f.regions[0],f.regions[0],f.regions[2]]},e,f.map),/INVENTORY_OVERLAP/);
  assert.throws(()=>validatePageInventory({regions:[{box:[0,0,1000,1000],columnCount:2}]},e,f.map),/INVENTORY_MERGED_TABLES/);
});

test("overview plus three isolated parts forms one complete document while preserving prose and every actual model call",async t=>{
  const f=await fixture(t);
  f.options.client=f.provider((request,n)=>{
    if(n===1){assert.match(request.messages[0].content,/ВСЕ самостоятельные таблицы/);return {regions:f.regions};}
    assert.match(request.messages[1].content[0].text,/ОДНОЙ таблицы/);
    return {tables:[f.tables[n-2]]};
  });
  const result=await extractDocumentTables(f.photo,f.options);
  assert.equal(result.status,"ready",JSON.stringify(result.validationDiagnostic));
  assert.equal(result.modelCalls,4);assert.equal(result.inputTokens,40);assert.equal(result.outputTokens,80);
  assert.equal(result.tableContext.inventory.count,3);assert.equal(result.tableContext.recovery.completed,3);
  assert.equal(result.content.blocks.filter(b=>b.type==="table").length,3);
  assert.match(result.content.documentContent.blocks.at(-1).text,/NOTICE outside tables/);
  assert.equal(result.content.documentContent.blocks.filter(b=>b.type==="table").length,3);
  assert.ok(result.content.blocks.filter(b=>b.type==="table")[2].unverifiedCells.length>0);
});

test("an incomplete overview stops before extraction even if its count agrees with two detected grids",async t=>{
  const f=await fixture(t);f.options.client=f.provider(()=>({regions:f.regions.slice(0,2)}));
  const result=await extractDocumentTables(f.photo,f.options);
  assert.equal(result.code,"TABLE_INVENTORY_INCOMPLETE");assert.equal(result.content,undefined);
  assert.equal(result.validationDiagnostic.reason,"INVENTORY_REGION_MISSING");assert.equal(f.requests.length,1);
});

test("one failed part receives one specific repair, and a repeated failure cannot produce partial ready content",async t=>{
  for(const recover of [true,false]){
    const f=await fixture(t);
    f.options.client=f.provider((request,n)=>{
      if(n===1)return {regions:f.regions};
      if(n===3||(!recover&&n===4))return {tables:[{...f.tables[1],rows:[["bad-width"]]}]};
      if(n===4){assert.match(request.messages[1].content[0].text,/Предыдущий ответ/);return {tables:[f.tables[1]]};}
      return {tables:[f.tables[n===2?0:2]]};
    });
    const result=await extractDocumentTables(f.photo,f.options);
    assert.equal(result.status,recover?"ready":"review");assert.equal(result.modelCalls,recover?5:4);
    if(!recover)assert.equal(result.content,undefined);
    assert.equal(result.tableContext.recovery.repairs,1);
  }
});

test("merged headers cover leaf columns exactly and invalid spans never get silently flattened",()=>{
  const rows=[[{text:"Group",col:0,colSpan:2,rowSpan:1}],
    [{text:"A",col:0,colSpan:1,rowSpan:1},{text:"B",col:1,colSpan:1,rowSpan:1}]];
  assert.deepEqual(validateHeaderRows(rows,["Group A","Group B"]),rows);
  for(const bad of [[rows[0],[]],[[{...rows[0][0],colSpan:3}]],[[{...rows[0][0],rowSpan:2}]]]){
    assert.throws(()=>validateHeaderRows(bad,["A","B"]),/HEADER_SPANS/);
  }
});
