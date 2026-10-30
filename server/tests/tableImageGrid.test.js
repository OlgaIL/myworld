import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { buildTableImageGrid, tableImageGridPrompt, validateTablesAgainstImageGrid, attachImageGridHeaders, recoverHeaderBoundedGrid } from '../utils/tableImageGrid.js';
import { buildGoogleOcrLayout } from '../utils/ocrLayout.js';
import { extractDocumentTables, photoWithTableHeaderRows } from '../services/documentTableService.js';

async function fixture(columns=10, scale=1, dottedBody=false) {
  const width=Math.round((columns*55+40)*scale),height=Math.round(210*scale);
  const pixels=Buffer.alloc(width*height,255),xs=Array.from({length:columns+1},(_,i)=>(20+i*55)*scale);
  const ys=[20,44,68,96,124,152,180].map(y=>y*scale);
  const cells=[{row:0,col:0,rowSpan:1,colSpan:columns,text:'Source table'}];
  const ordinary=columns-6;
  for(let c=0;c<ordinary;c++)cells.push({row:1,col:c,rowSpan:2,colSpan:1,text:`Column ${c+1}`});
  for(let g=0;g<3;g++){
    cells.push({row:1,col:ordinary+g*2,rowSpan:1,colSpan:2,text:`Group ${g+1}`});
    for(let sub=0;sub<2;sub++)cells.push({row:2,col:ordinary+g*2+sub,rowSpan:1,colSpan:1,text:sub?'Norm':'Meter'});
  }
  const rows=[];
  for(let r=0;r<3;r++){
    const row=Array(columns).fill('');row[1]=['Alpha','Beta','Gamma'][r];row[columns-2]=`${r+1}00,00`;rows.push(row);
    for(let c=0;c<columns;c++)cells.push({row:r+3,col:c,rowSpan:1,colSpan:1,text:row[c]});
  }
  const annotations=[{description:'Source table'}];
  for(const cell of cells){
    const x1=Math.round(xs[cell.col]),x2=Math.round(xs[cell.col+cell.colSpan]);
    const y1=Math.round(ys[cell.row]),y2=Math.round(ys[cell.row+cell.rowSpan]);
    for(let x=x1;x<=x2;x++){pixels[y1*width+x]=0;pixels[y2*width+x]=0;}
    for(let y=y1;y<=y2;y++)if(!dottedBody||cell.row<3||y%3===0){pixels[y*width+x1]=0;pixels[y*width+x2]=0;}
    if(cell.text)annotations.push({description:cell.text,boundingPoly:{vertices:[
      {x:(x1+x2)/2-12*scale,y:(y1+y2)/2-4*scale},{x:(x1+x2)/2+12*scale,y:(y1+y2)/2+4*scale}]}});
  }
  const image=await sharp(pixels,{raw:{width,height,channels:1}}).png().toBuffer();
  const layout=buildGoogleOcrLayout({textAnnotations:annotations},image,'Source table');
  const map=await buildTableImageGrid(image,layout);
  const table={title:'Source table',headers:map.tables[0]?.columns.map(c=>c.headerPath.join(' / ')),rows};
  return {image,layout,map,table};
}

test('image lines independently recover varying column counts, blank columns and merged headers',async()=>{
  for(const [columns,scale] of [[8,1],[10,1],[12,1.5]]){
    const {map}=await fixture(columns,scale);
    assert.equal(map.status,'detected');assert.equal(map.tables.length,1);
    const grid=map.tables[0];
    assert.equal(grid.columns.length,columns);
    assert.deepEqual(grid.dataRows.map(r=>r.sourceRow),[4,5,6]);
    assert.equal(grid.columns[columns-6].headerPath.join(' / '),'Group 1 / Meter');
    assert.equal(grid.columns[columns-1].headerPath.join(' / '),'Group 3 / Norm');
    assert.ok(grid.cells.some(c=>c.rowSpan===2));
    assert.ok(grid.cells.some(c=>c.colSpan===2));
    assert.ok(grid.dataRows.every(r=>r.cells[0]===''));
  }
});

test('a whole numeric column shift fails even though every number and its order are preserved',async()=>{
  const {map,table}=await fixture();
  assert.equal(validateTablesAgainstImageGrid([table],map).valid,true);
  const shifted=structuredClone(table);
  shifted.rows.forEach(row=>{row[9]=row[8];row[8]='';});
  assert.deepEqual(validateTablesAgainstImageGrid([shifted],map),{valid:false,reason:'CELL_COLUMN_MISMATCH',at:[0,0,8]});
  const missing=structuredClone(table);missing.rows.shift();
  assert.equal(validateTablesAgainstImageGrid([missing],map).reason,'TABLE_GRID_ROWS_MISSING');
  const wrong=structuredClone(table);wrong.rows[0][8]='10,000';
  assert.equal(validateTablesAgainstImageGrid([wrong],map).reason,'CELL_VALUE_MISMATCH');
  const mismatch=structuredClone(table);mismatch.headers.pop();
  assert.equal(validateTablesAgainstImageGrid([mismatch],map).reason,'TABLE_GRID_COLUMN_MISMATCH');
  const wrongGroup=structuredClone(table);wrongGroup.headers[4]='Group 2 / Meter';
  assert.equal(validateTablesAgainstImageGrid([wrongGroup],map).reason,'TABLE_GRID_HEADER_MISMATCH');
  const forged=structuredClone(table);forged.sourceRows=[5,6,7];
  assert.equal(validateTablesAgainstImageGrid([forged],map).valid,false);
});

test('the model gets the complete header map and source rows, not a guessed number of columns',async()=>{
  const {map,table}=await fixture();
  const prompt=tableImageGridPrompt(map);
  assert.match(prompt,/"columnCount":10/u);
  assert.match(prompt,/"rowSpan":2/u);
  assert.match(prompt,/"headerPath":\["Group 3","Norm"\]/u);
  assert.match(prompt,/"sourceRow":4/u);
  assert.equal(validateTablesAgainstImageGrid([{...table,gridId:'grid-1',sourceRows:[4,5,6]}],map).valid,true);
});

test('missing title does not mask a shifted answer or prevent a valid grid result',async()=>{
  const {image,layout,map,table}=await fixture();
  let calls=0,gridBuilds=0;
  const options={config:{enabled:true,apiKey:'synthetic',baseURL:'https://synthetic.invalid/v1',model:'openai/gpt-4.1-mini',timeoutMs:1000,maxTokens:6000},
    resolveImage:async()=>new URL(import.meta.url),layout,
    buildGrid:async()=>{gridBuilds++;return map;},
    client:{chat:{completions:{create:async request=>{
      calls++;assert.equal(gridBuilds,1);assert.match(request.messages[1].content[0].text,/Независимая карта сетки/u);
      const shifted=structuredClone(table);shifted.rows.forEach(row=>{row[9]=row[8];row[8]='';});
      delete shifted.title;
      return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({tables:[shifted]})}}]};
    }}}}};
  // The file reader remains real; image identity is explicitly rebuilt for
  // this synthetic transport fixture, while the grid itself is image-derived.
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL(import.meta.url));
  options.layout=buildGoogleOcrLayout({textAnnotations:layout.textAnnotations},source,layout.rawText);
  const result=await extractDocumentTables({storage_path:'synthetic',mime_type:'image/png'},options);
  assert.equal(image.length>0,true);assert.equal(calls,1);
  assert.equal(result.status,'review');assert.equal(result.code,'CELL_COLUMN_MISMATCH');
  assert.equal(result.validationDiagnostic.field,'tables[0].rows[0][8]');
  options.client={chat:{completions:{create:async()=>{
    calls++;
    return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({tables:[{headers:table.headers,rows:table.rows}]})}}]};
  }}}};
  const accepted=await extractDocumentTables({storage_path:'synthetic',mime_type:'image/png',
    formatted_content:{blocks:[{type:'table_source',tableId:'table-1',text:'Synthetic grid source'}]}},options);
  assert.equal(calls,2);assert.equal(accepted.status,'ready');
  assert.equal(accepted.content.blocks[0].text,'Source table');
  assert.deepEqual(accepted.content.blocks[1].rows,table.rows);
  assert.deepEqual(accepted.tableContext.normalizations,[{reason:'TITLE_FROM_SOURCE',table:0}]);
});

test('an undecodable image supplies no invented grid',async()=>{
  assert.equal((await buildTableImageGrid(Buffer.from('not an image'),{textAnnotations:[]})).status,'unavailable');
});

test('a solid multilevel header and independently dotted body recover varying leaf counts without model cell positions',async()=>{
  for(const [columns,scale] of [[8,1],[10,1.5],[14,1]]){
    const {image,layout,table}=await fixture(columns,scale,true);
    const grid=await recoverHeaderBoundedGrid(image,layout,{left:20*scale,top:20*scale,right:(20+columns*55)*scale,bottom:180*scale});
    assert.ok(grid);assert.equal(grid.columns.length,columns);
    assert.deepEqual(grid.dataRows.map(r=>r.sourceRow),[4,5,6]);
    const map={status:'detected',tables:[{...grid,id:'grid-1'}]};
    const candidate={...table,headers:grid.columns.map(c=>c.headerPath.join(' / '))};
    assert.equal(validateTablesAgainstImageGrid([candidate],map).valid,true);
    const shifted=structuredClone(candidate);shifted.rows.forEach(row=>{row[columns-1]=row[columns-2];row[columns-2]='';});
    assert.equal(validateTablesAgainstImageGrid([shifted],map).reason,'CELL_COLUMN_MISMATCH');
    assert.equal(attachImageGridHeaders([candidate],map)[0].headerRows.length,2);
  }
  assert.equal(await recoverHeaderBoundedGrid(Buffer.from('not an image'),{textAnnotations:[]},{left:0,right:100,top:0,bottom:100}),null);
});

test('header spans come from the image grid and ready results can gain them without modifying stored cells',async()=>{
  const {layout,map,table}=await fixture();
  const decorated=attachImageGridHeaders([table],map)[0];
  assert.equal(decorated.headerRows.length,2);
  assert.equal(decorated.headerRows[0][0].rowSpan,2);
  assert.equal(decorated.headerRows[0].filter(c=>c.colSpan===2).length,3);
  assert.deepEqual(decorated.rows,table.rows);assert.deepEqual(decorated.headers,table.headers);
  const fs=await import('node:fs/promises'),bytes=await fs.readFile(new URL(import.meta.url));
  const saved={table_status:'ready',storage_path:'synthetic',table_content:{blocks:[{type:'table',...table}]}};
  const before=structuredClone(saved);
  const result=await photoWithTableHeaderRows(saved,{
    resolveImage:async()=>new URL(import.meta.url),
    loadLayout:async()=>buildGoogleOcrLayout({textAnnotations:layout.textAnnotations},bytes,layout.rawText),
    buildGrid:async()=>map
  });
  assert.deepEqual(result.table_content.blocks[0].headerRows,decorated.headerRows);
  assert.deepEqual(result.table_content.blocks[0].rows,table.rows);
  assert.deepEqual(saved,before);
});
