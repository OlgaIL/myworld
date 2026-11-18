import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLocalRequisiteResult,isLocalRequisiteLayoutEnabled,isRequisiteLayoutEnabled} from '../services/requisiteProcessingService.js';
import {getEffectiveTextContent} from '../utils/textCorrections.js';
import {mapPhotoInfo} from '../utils/photos.js';
import {mapGuestDocumentInfo} from '../utils/guest.js';
import {getFormattedHtml,getFormattedText} from '../../client/src/utils/formattedClipboard.js';
import {requisiteDocument} from './fixtures/requisiteDocument.js';

const env={LOCAL_REQUISITE_LAYOUT_ENABLED:'true',DATABASE_URL:'postgres://test@localhost/test',NODE_ENV:'test'};
const pipeline={pipeline:'standard',ocrProvider:'google',aiProvider:'timeweb'};
const result={title:'Справка',notes:'',cleanText:'Old model order',formattedContent:{blocks:[{type:'paragraph',text:'Old model order'}]},corrections:[{original:'0',replacement:'O'}],hasTable:true};
const apply=(layout=requisiteDocument(),extra={})=>applyLocalRequisiteResult(layout.text,result,layout,{env,pipeline,...extra});

test('feature is opt-in and restricted to non-production local databases',()=>{
 assert.equal(isLocalRequisiteLayoutEnabled(env),true);
 for(const e of [{...env,LOCAL_REQUISITE_LAYOUT_ENABLED:'false'},{...env,NODE_ENV:'production'},
  {...env,DATABASE_URL:'postgres://test@db.example/test'},{...env,DATABASE_URL:''}])assert.equal(isLocalRequisiteLayoutEnabled(e),false);
});
test('production rollout uses its own explicit switch and can be disabled independently',()=>{
 const production={NODE_ENV:'production',DATABASE_URL:'postgres://test@db.example/test',LOCAL_REQUISITE_LAYOUT_ENABLED:'true'};
 assert.equal(isRequisiteLayoutEnabled(production),false);
 assert.equal(isRequisiteLayoutEnabled({...production,REQUISITE_LAYOUT_ENABLED:'true'}),true);
 assert.equal(isRequisiteLayoutEnabled({...production,REQUISITE_LAYOUT_ENABLED:'false'}),false);
 assert.equal(isRequisiteLayoutEnabled({...env,REQUISITE_LAYOUT_ENABLED:'false'}),false);
 assert.equal(isRequisiteLayoutEnabled({...production,REQUISITE_LAYOUT_ENABLED:'TRUE'}),false);
 const layout=requisiteDocument();
 const recovered=apply(layout,{env:{...production,REQUISITE_LAYOUT_ENABLED:'true'}});
 assert.equal(recovered.formattedContent.requisiteLayout.source,'google_coordinates');
 assert.equal(apply(layout,{env:{...production,REQUISITE_LAYOUT_ENABLED:'false'}}),result);
});
test('original OCR survives in both account and guest views; table values survive text mapping/copy',()=>{
 const layout=requisiteDocument(),before=JSON.stringify({layout,result}),r=apply(layout);
 assert.equal(JSON.stringify({layout,result}),before);
 assert.equal(r.formattedContent.requisiteLayout.requiresReview,true);assert.equal(r.hasTable,false);
 assert.deepEqual(r.corrections,[]);assert.match(r.cleanText,/ИНН\t0123456789/u);
 assert.match(r.cleanText,/Подпись исполнителя/u);assert.match(r.cleanText,/Справка о банковских реквизитах/u);
 const stored={id:5,filename:'test.png',status:'processed',ocr_text:layout.text,clean_text:r.cleanText,
  formatted_content:r.formattedContent,has_table:r.hasTable,corrections:r.corrections,ai_notes:r.notes};
 const photo=mapPhotoInfo(stored),guest=mapGuestDocumentInfo(stored);
 assert.equal(photo.text,layout.text);assert.equal(guest.text,layout.text);
 assert.equal(photo.cleanText,r.cleanText);assert.equal(guest.cleanText,r.cleanText);
 assert.equal(photo.hasTable,false);assert.equal(guest.hasTable,false);
 assert.equal(getEffectiveTextContent(r.formattedContent,[]).cleanText,r.cleanText);
 assert.match(getFormattedText(photo.formattedContent),/ИНН\t0123456789/u);
 assert.match(getFormattedHtml(photo.formattedContent),/<td[^>]*>0123456789<\/td>/u);
 assert.equal(guest.formattedContent,null,'protected format stays protected for guests');
});
test('disabled flag, wrong provider/mode, absent/stale coordinates leave the original model result intact',()=>{
 const layout=requisiteDocument();
 for(const options of [{env:{...env,LOCAL_REQUISITE_LAYOUT_ENABLED:'false'}},
  {pipeline:{...pipeline,pipeline:'fast'}},{pipeline:{...pipeline,ocrProvider:'yandex'}}])assert.equal(apply(layout,options),result);
 assert.equal(applyLocalRequisiteResult(layout.text,result,null,{env,pipeline}),result);
 assert.equal(applyLocalRequisiteResult('different OCR',result,layout,{env,pipeline}),result);
 const damaged=structuredClone(layout);damaged.textAnnotations.push({description:'missing geometry'});
 assert.equal(apply(damaged),result);
});
test('formatting failure is never converted to success by local recovery',()=>{
 const layout=requisiteDocument(),failure={error:'TIMEWEB_TIMEOUT'};
 assert.equal(applyLocalRequisiteResult(layout.text,failure,layout,{env,pipeline}),failure);
});
test('unfamiliar/plain documents remain on the original processing path',()=>{
 const layout=requisiteDocument();layout.textAnnotations=layout.textAnnotations.slice(0,4);
 assert.equal(apply(layout),result);
});
test('wrong format gets a review marker with the original digits, not a repaired number',()=>{
 const layout=requisiteDocument();
 layout.textAnnotations.find(w=>w.description==='044525225').description='04452522';
 const r=apply(layout),tables=r.formattedContent.blocks.filter(b=>b.type==='table');
 const table=tables.find(t=>t.rows.some(row=>row[0]==='БИК'));
 const index=table.rows.findIndex(row=>row[0]==='БИК');
 assert.equal(table.rows[index][1],'04452522');assert.equal(r.formattedContent.requisiteLayout.mismatchCount,1);
 assert.match(table.unverifiedCells.find(c=>c.row===index).reason,/Длина: 9/u);
});
