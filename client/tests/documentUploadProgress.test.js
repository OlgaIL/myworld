import test from "node:test";
import assert from "node:assert/strict";
import { documentUploadView, uploadCountsLabel, uploadPageLabel } from "../src/utils/documentUploadProgress.js";

const doc={id:"doc",activity:{}};
const saved=(n,status="processed")=>({pageId:String(n),filename:`${n}.jpg`,status});
const item=(n,phase="queued")=>({itemId:`item-${n}`,ordinal:n,phase});

test("every selected photo has a place before the first save",()=>{
  const view=documentUploadView({id:"upload"},[],{active:true,mode:"group",items:[item(1,"preparing"),item(2),item(3)]});
  assert.equal(view.expected,3);assert.equal(view.uploaded,0);assert.equal(view.processing,1);assert.equal(view.waiting,2);
  assert.equal(new Set(view.rows.map(p=>p.pageId)).size,3);
});
test("saved pages replace selected slots without changing the expected count",()=>{
  const view=documentUploadView(doc,[saved(1)],{active:true,mode:"group",documentId:"doc",items:[{...item(1,"done"),filename:"1.jpg",pageId:"1"},item(2,"uploading"),item(3)]});
  assert.equal(view.expected,3);assert.equal(view.uploaded,1);assert.equal(view.processed,1);
  assert.equal(view.rows.filter(p=>p.placeholder).length,2);
  assert.equal(view.reason,"Дождитесь окончания загрузки.");
});
test("the archive API manifest retains missing pages after navigation or reload",()=>{
  const view=documentUploadView({...doc,uploadProgress:{state:"partial",items:[{itemId:"1",state:"stored",photoId:"1",filename:"1.jpg"},{itemId:"2",state:"cancelled"},{itemId:"3",state:"cancelled"}]}},[saved(1)]);
  assert.equal(view.expected,3);assert.equal(view.uploaded,1);assert.equal(view.notUploaded,2);assert.equal(view.visible,true);
  assert.equal(view.active,false);assert.match(uploadCountsLabel(view),/не загружено: 2/);
});
test("a mixed document counts results, processing and errors independently",()=>{
  const view=documentUploadView({...doc,activity:{processing:true}},[saved(1),saved(2,"recognized"),saved(3,"error"),saved(4,"processing")]);
  assert.equal(view.expected,4);assert.equal(view.uploaded,4);assert.equal(view.processed,2);assert.equal(view.errors,1);assert.equal(view.processing,1);
  assert.equal(view.reason,"Дождитесь окончания обработки.");
});
test("an unconfirmed request remains distinct from a known processing failure",()=>{
  const view=documentUploadView(doc,[],{active:false,mode:"group",documentId:"doc",items:[item(1,"interrupted"),item(2,"not_started")]});
  assert.equal(view.processing,0);assert.equal(view.errors,1);assert.equal(view.notUploaded,1);
  assert.match(uploadPageLabel(view.rows[0]),/Нет подтверждения/);
  assert.doesNotMatch(uploadPageLabel(view.rows[0]),/не списана/);
});
test("moved or removed saved pages do not reappear as upload placeholders",()=>{
  const view=documentUploadView({...doc,uploadProgress:{state:"completed",items:[{itemId:"1",state:"stored",photoId:"1",filename:"1.jpg"},{itemId:"2",state:"removed"}]}},[]);
  assert.equal(view.expected,0);assert.equal(view.visible,false);
});
test("another document's selection and replacement do not add pages here",()=>{
  for(const session of [{mode:"group",documentId:"other"},{mode:"replace",documentId:"doc"}]){
    const view=documentUploadView(doc,[saved(1)],{...session,active:true,items:[item(1),item(2)]});
    assert.equal(view.expected,1);assert.equal(view.active,false);
  }
});
test("a confirmed result clears an old connection warning",()=>{
  const view=documentUploadView(doc,[saved(1)],{active:false,mode:"group",documentId:"doc",items:[{...item(1,"interrupted"),filename:"1.jpg",message:"Нет ответа"}]});
  assert.equal(view.rows[0].uploadMessage,null);assert.equal(view.processed,1);assert.equal(view.errors,0);
});
test("a later manifest confirmation replaces a slot whose response was not received",()=>{
  const view=documentUploadView({...doc,uploadProgress:{batchId:"batch",items:[{itemId:"item-1",state:"stored",photoId:"1",filename:"1.jpg"}]}},[saved(1)],
    {active:false,mode:"group",documentId:"doc",batchId:"batch",items:[item(1,"interrupted")]});
  assert.equal(view.expected,1);assert.equal(view.uploaded,1);assert.equal(view.processed,1);
});
