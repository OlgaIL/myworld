import test from "node:test";
import assert from "node:assert/strict";
import { combineDocumentCopy } from "../src/utils/documentCopy.js";
import { getFormattedHtml } from "../src/utils/formattedClipboard.js";

test("document copy keeps each selected variant in page order without service metadata",()=>{
  const result=combineDocumentCopy([{text:"Exact ORIGINAL\n spacing"},{text:""},{text:"Manual improvement",title:"Service title",summary:"Annotation"}]);
  assert.deepEqual(result,{text:"Exact ORIGINAL\n spacing\n\nManual improvement"});
});
test("mixed rich/plain document copy has one HTML body, editable cells and escaped plain text",()=>{
  const html=getFormattedHtml({blocks:[{type:"table",headers:["Name","Amount"],rows:[["x", "12.50"]]}]});
  const result=combineDocumentCopy([{text:"<script>bad()</script>"},{text:"Name\tAmount\nx\t12.50",html},{text:"Final\nline"}]);
  assert.equal((result.html.match(/<body>/g)||[]).length,1);assert.equal((result.html.match(/<table /g)||[]).length,1);
  assert.match(result.html,/&lt;script&gt;/);assert.doesNotMatch(result.html,/<script>/);assert.match(result.html,/Final<br>line/);
  assert.equal(result.text,"<script>bad()</script>\n\nName\tAmount\nx\t12.50\n\nFinal\nline");
});
