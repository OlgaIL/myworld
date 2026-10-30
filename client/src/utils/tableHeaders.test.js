import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableHeaderRows } from './tableHeaders.js';
import { getFormattedHtml, getFormattedText } from './formattedClipboard.js';
import { mergeFormattedTables } from './mergeFormattedTables.js';

const table={type:'table',tableId:'table-1',headers:['Code','Name','Volume / Group A / Meter','Volume / Group A / Norm','Volume / Group B / Meter','Volume / Group B / Norm'],
  headerRows:[
    [{text:'Code',col:0,rowSpan:3,colSpan:1},{text:'Name',col:1,rowSpan:3,colSpan:1},{text:'Volume',col:2,rowSpan:1,colSpan:4}],
    [{text:'Group A',col:2,rowSpan:1,colSpan:2},{text:'Group B',col:4,rowSpan:1,colSpan:2}],
    [{text:'Meter',col:2,rowSpan:1,colSpan:1},{text:'Norm',col:3,rowSpan:1,colSpan:1},{text:'Meter',col:4,rowSpan:1,colSpan:1},{text:'Norm',col:5,rowSpan:1,colSpan:1}]
  ],rows:[['','Alpha','','1,0000','175,0000','']]};

test('merged headers cover every leaf column once across all three levels',()=>{
  assert.deepEqual(getTableHeaderRows(table),table.headerRows);
  for(const mutate of [t=>{t.headerRows[0][2].colSpan=5;},t=>{t.headerRows[1][0].col=1;},t=>{t.headerRows[2].pop();}]){
    const invalid=structuredClone(table);mutate(invalid);
    assert.equal(getTableHeaderRows(invalid).length,1);
    assert.deepEqual(getTableHeaderRows(invalid)[0].map(c=>c.text),table.headers);
  }
});

test('HTML clipboard carries real spans once while TSV keeps complete leaf headers',()=>{
  const content={blocks:[table]},html=getFormattedHtml(content);
  assert.match(html,/<th colspan="4" rowspan="1"[^>]*>Volume<\/th>/u);
  assert.equal((html.match(/>Volume<\/th>/gu)||[]).length,1);
  assert.equal((html.match(/rowspan="3"/gu)||[]).length,2);
  assert.equal((html.match(/colspan="2"/gu)||[]).length,2);
  assert.match(html,/font-size:9pt/u);
  assert.match(html,/<td[^>]*>1,0000<\/td><td[^>]*>175,0000<\/td>/u);
  assert.equal(getFormattedText(content),[table.headers,...table.rows].map(r=>r.join('\t')).join('\n'));
  const malicious=structuredClone(table);malicious.headerRows[0][2].text='<script>unsafe()</script>';
  assert.doesNotMatch(getFormattedHtml({blocks:[malicious]}),/<script>/u);
});

test('formatting and persistence keep spans and cells together without changing surrounding prose',()=>{
  const before={blocks:[{type:'paragraph',text:'Before'},{type:'table_source',tableId:'table-1',text:'Source'},{type:'paragraph',text:'After'}]};
  const reopened=JSON.parse(JSON.stringify({blocks:[table]}));
  const result=mergeFormattedTables(before,reopened);
  assert.equal(result.merged,true);
  assert.deepEqual(result.content.blocks[1],table);
  assert.deepEqual(result.content.blocks.filter(b=>b.type==='paragraph'),[before.blocks[0],before.blocks[2]]);
});
