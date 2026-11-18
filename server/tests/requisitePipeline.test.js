import test from 'node:test';
import assert from 'node:assert/strict';
import {requisiteDocument} from './fixtures/requisiteDocument.js';

// Every fetch is replaced before the pipeline is imported; no provider/DB requests.
globalThis.__myworldEnvLoaded=true;
Object.assign(process.env,{DATABASE_URL:'postgres://synthetic@localhost/synthetic',NODE_ENV:'test',
 LOCAL_REQUISITE_LAYOUT_ENABLED:'true',TIMEWEB_AI_ENABLED:'true',TIMEWEB_API_KEY:'synthetic-only',
 TIMEWEB_MODEL:'synthetic-model',TIMEWEB_BASE_URL:'http://127.0.0.1:9/v1'});
const {enrichWithPipeline}=await import('../services/processingPipelineService.js');
test('normal enrichment calls the model once, preserves its OCR input, then applies local structure for all audiences',async()=>{
 const originalFetch=globalThis.fetch,layout=requisiteDocument();let calls=0,metrics=0;
 globalThis.fetch=async(_url,options)=>{
  calls++;const request=JSON.parse(options.body);
  assert.ok(request.messages[1].content.endsWith(layout.text));
  const payload={title:'Справка',summary:'',category:'документ',section:'документы',topic:'',tags:[],
   formattedContent:{blocks:[{type:'paragraph',text:'Перемешанный текст модели'}]},hasTable:false,
   hasFormulas:false,hasRecognitionErrors:false,textQuality:'full_text',corrections:[],notes:''};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)},finish_reason:'stop'}]}),
   {status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  for(const audience of ['guest','free','paid']){
   const r=await enrichWithPipeline(layout.text,{pipeline:'standard',ocrProvider:'google',aiProvider:'timeweb',audience},
    {layout,persistMetrics:async()=>{metrics++;}});
   assert.equal(r.error,undefined);assert.equal(r.formattedContent.requisiteLayout.source,'google_coordinates');
   assert.match(r.cleanText,/044525225/u);assert.match(r.cleanText,/0123456789/u);
  }
  assert.equal(calls,3);assert.equal(metrics,3);
  // The release switch follows the same pipeline with a production env.
  const previous=process.env.REQUISITE_LAYOUT_ENABLED;
  const previousMode=process.env.NODE_ENV;
  try{
   process.env.REQUISITE_LAYOUT_ENABLED='true';process.env.NODE_ENV='production';
   const r=await enrichWithPipeline(layout.text,{pipeline:'standard',ocrProvider:'google',aiProvider:'timeweb',audience:'paid'},
    {layout,persistMetrics:async()=>{metrics++;}});
   assert.equal(r.formattedContent.requisiteLayout.source,'google_coordinates');
   assert.equal(calls,4);assert.equal(metrics,4);
   process.env.REQUISITE_LAYOUT_ENABLED='false';
   const plain=await enrichWithPipeline(layout.text,{pipeline:'standard',ocrProvider:'google',aiProvider:'timeweb',audience:'paid'},
    {layout,persistMetrics:async()=>{metrics++;}});
   assert.equal(plain.formattedContent.requisiteLayout,undefined);
   assert.equal(calls,5);assert.equal(metrics,5);
  }finally{
   if(previous===undefined)delete process.env.REQUISITE_LAYOUT_ENABLED;else process.env.REQUISITE_LAYOUT_ENABLED=previous;
   process.env.NODE_ENV=previousMode;
  }
 }finally{globalThis.fetch=originalFetch;}
});
