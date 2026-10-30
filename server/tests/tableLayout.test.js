import assert from "node:assert/strict";
import test from "node:test";
import { locateTableLayouts,tableSourceRanges } from "../utils/tableLayout.js";
const word=(description,x,y)=>({description,boundingPoly:{vertices:[{x,y},{x:x+30,y},{x:x+30,y:y+10},{x,y:y+10}]}});

test("missing OCR cells are marked; contradictory numbers and decimal shifts are rejected",()=>{
  const table={title:"",headers:["Code","Name","Factor","Value"],rows:[["","Alpha","1","100,00"],["","Beta","1","200,00"]]};
  const annotations=[{description:"synthetic"},...table.headers.map((v,c)=>word(v,30+c*110,40)),
    word("Alpha",140,80),word("100,00",360,80),word("Beta",140,110),word("200,00",360,110)];
  const checked=locateTableLayouts([table],annotations);
  assert.equal(checked.valid,true);
  assert.deepEqual(checked.unverifiedCells,[{table:0,row:0,col:2},{table:0,row:1,col:2}]);
  for(const value of ["999,99","20,000"]){
    const wrong=structuredClone(table);wrong.rows[1][3]=value;
    assert.equal(locateTableLayouts([wrong],annotations).valid,false);
  }
});

test("wrapped text stays in the same table row",()=>{
  const table={title:"",headers:["Name","Address","Value"],rows:[["Alpha","Long street name","100"],["Beta","Other road","200"]]};
  const annotations=[{description:"synthetic"},word("Name",30,30),word("Address",200,30),word("Value",400,30),
    word("Alpha",30,80),word("Long",200,70),word("street",240,70),word("name",200,82),word("100",400,80),
    word("Beta",30,120),word("Other",200,110),word("road",245,110),word("200",400,120)];
  assert.equal(locateTableLayouts([table],annotations).valid,true);
});

test("interleaved grids share a source span only if every source word belongs to those grids",()=>{
  const raw="Top\nBottom\n1\n2\nProse\n";
  const layout={rawText:raw,textAnnotations:[{description:raw},word("Top",30,20),word("Bottom",30,110),
    word("1",100,40),word("2",100,130),word("Prose",30,200)]};
  const ranges=tableSourceRanges(layout,[{top:10,bottom:55},{top:100,bottom:145}]);
  assert.deepEqual(ranges,[{start:0,end:14,tableIndexes:[0,1]}]);
  assert.equal(raw.slice(ranges[0].end).trim(),"Prose");
  layout.textAnnotations[3]=word("1",100,75);
  assert.equal(tableSourceRanges(layout,[{top:10,bottom:55},{top:100,bottom:145}]),null);
});
