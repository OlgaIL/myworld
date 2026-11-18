import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverRequisiteLayout,validateRequisite} from '../utils/requisiteLayout.js';

function layoutOf(rows,{slope=0,reverse=false}={}){
 const words=[];
 for(const [y,label,value='',second=''] of rows){
  for(const [start,text] of [[20,label],[350,value],[580,second]]){
   let x=start;
   for(const token of text.split(/\s+/u).filter(Boolean)){
    const w=token.length*7;
    words.push({description:token,boundingPoly:{vertices:[
     {x,y:y+slope*x},{x:x+w,y:y+slope*(x+w)},
     {x:x+w,y:y+12+slope*(x+w)},{x,y:y+12+slope*x}
    ]}});x+=w+5;
   }
  }
 }
 const text=rows.map(r=>r.slice(1).filter(Boolean).join(' ')).join('\n');
 return {version:1,provider:'google',width:900,height:2000,text,rawText:text,
  textAnnotations:[{description:text},...(reverse?words.reverse():words)]};
}
const fields=r=>r.sections.flatMap(s=>s.fields);

test('RU and TJ tax numbers have different length profiles; preserve leading zero',()=>{
 assert.equal(validateRequisite('inn','000123456','TJ').status,'format_match');
 assert.equal(validateRequisite('inn','000123456','RU').status,'mismatch');
 assert.equal(validateRequisite('inn','000123456','TJ').raw,'000123456');
 for(const raw of ['1234567890','123456789012'])assert.equal(validateRequisite('inn',raw,'RU').status,'format_match');
});
test('unknown national format is unverified rather than rejected as Russian',()=>{
 assert.equal(validateRequisite('inn','000123456').status,'profile_required');
 assert.equal(validateRequisite('correspondent_account','20402972316264','TJ').status,'profile_required');
 assert.equal(validateRequisite('bik','123456789','TJ').status,'profile_required');
});
test('SWIFT shape checks 8/11 characters and does not repair Cyrillic twins',()=>{
 for(const s of ['ASSETJ22','SABRRUMM012'])assert.equal(validateRequisite('swift',s).status,'format_match');
 const bad='АSSETJ22';
 assert.equal(validateRequisite('swift',bad).status,'mismatch');
 assert.equal(validateRequisite('swift',bad).raw,bad);
 assert.equal(validateRequisite('swift','ASSETJ2').status,'mismatch');
});
test('RU BIK/account length and numeric alphabet are checked without guessing digits',()=>{
 assert.equal(validateRequisite('bik','044525225','RU').status,'format_match');
 assert.equal(validateRequisite('bik','04452522','RU').status,'mismatch');
 assert.equal(validateRequisite('account','30101810400000000225','RU').status,'format_match');
 const bad='301O1810400000000225';
 assert.equal(validateRequisite('account',bad,'RU').status,'mismatch');
 assert.equal(validateRequisite('account',bad,'RU').raw,bad);
});
test('empty values and unsupported labels remain explicit',()=>{
 assert.equal(validateRequisite('bik','','RU').status,'missing');
 assert.equal(validateRequisite('unknown','12345','RU').status,'not_checked');
});
test('six blocks and arbitrary labels, including skew and scrambled OCR order',()=>{
 const rows=[];
 for(let i=0;i<6;i++){
  const y=50+i*220;
  rows.push([y,'Получатель',`Тест${i}`],[y+25,'Банк получателя',`Банк${i}`],
   [y+50,'Адрес','Таджикистан'],[y+75,'БИК','123456789'],[y+100,'ИНН','000123456'],
   [y+125,'Код офиса',String(100+i)]);
 }
 const source=layoutOf(rows,{slope:0.06,reverse:true});const before=JSON.stringify(source);
 const r=recoverRequisiteLayout(source);
 assert.equal(r.sections.length,6);assert.equal(fields(r).length,36);
 assert.equal(r.wordCoverageComplete,true);assert.equal(JSON.stringify(source),before);
 assert.equal(fields(r).filter(f=>f.type==='unknown').length,6);
 assert.ok(r.requiresReview);assert.equal(r.status,'review');
 for(let i=0;i<6;i++){
  assert.equal(r.sections[i].fields[0].value,`Тест${i}`);
  assert.equal(r.sections[i].fields.at(-1).value,String(100+i));
 }
});
test('wrong-length geometry matches are not swapped to make validation pass',()=>{
 const r=recoverRequisiteLayout(layoutOf([[30,'Получатель','Тест'],[60,'Адрес','Россия'],
  [90,'БИК','1234567890'],[120,'ИНН','123456789']]));
 const f=fields(r);assert.equal(f.find(x=>x.type==='bik').value,'1234567890');
 assert.equal(f.find(x=>x.type==='inn').value,'123456789');
 assert.equal(f.find(x=>x.type==='bik').validation.status,'mismatch');
 assert.equal(f.find(x=>x.type==='inn').validation.status,'mismatch');
});
test('empty BIK does not take value from next INN row',()=>{
 const r=recoverRequisiteLayout(layoutOf([[30,'Получатель','Тест'],[60,'Банк получателя','Банк'],
  [90,'БИК',''],[120,'ИНН','1234567890']]));
 assert.equal(fields(r).find(x=>x.type==='bik').status,'missing');
 assert.equal(fields(r).find(x=>x.type==='inn').value,'1234567890');
});
test('two numeric candidates remain ambiguous rather than chosen by length',()=>{
 const r=recoverRequisiteLayout(layoutOf([[30,'Получатель','Тест'],[60,'Адрес','Россия'],
  [90,'БИК','123456789','987654321']]));
 const f=fields(r).find(x=>x.type==='bik');
 assert.equal(f.status,'review');assert.match(f.value,/123456789.*987654321/u);
 assert.ok(f.geometryWarnings.some(w=>w.includes('несколько')));
});
test('ordinary text is not converted based on a single keyword',()=>{
 const layout=layoutOf([[30,'Обычное письмо с текстом'],[60,'БИК используется в примере'],[90,'Далее идёт обычный абзац']]);
 const r=recoverRequisiteLayout(layout);
 assert.equal(r.status,'not_applicable');assert.equal(r.sections.length,0);
 assert.equal(r.sourceText,layout.text);assert.equal(r.wordCoverageComplete,true);
});
test('unlabelled bank above address stays separate instead of becoming address text',()=>{
 const r=recoverRequisiteLayout(layoutOf([[30,'Получатель','Тест'],[60,'Банк получателя','Банк'],
  [90,'Swift','ASSETJ22'],[115,'','Другой банк РФ'],[140,'Адрес','Москва'],[165,'БИК','123456789']]));
 assert.equal(fields(r).find(f=>f.type==='address').value,'Москва');
 assert.ok(r.unplacedLines.some(l=>l.text==='Другой банк РФ'));
 assert.equal(fields(r).find(f=>f.type==='bik').country,'RU');
});
test('bank country change is not inherited by the next beneficiary bank',()=>{
 const r=recoverRequisiteLayout(layoutOf([[30,'Correspondent bank:','Bank Uzbekistan'],[60,'Swift:','NBFAUZ2X'],
  [90,'Beneficiary bank:','Other bank'],[120,'ИНН','000123456']]));
 assert.equal(fields(r).find(f=>f.type==='inn').country,'unknown');
 assert.equal(fields(r).find(f=>f.type==='inn').validation.status,'profile_required');
});
test('unsupported coordinates are disclosed and original text remains available',()=>{
 const layout=layoutOf([[30,'Получатель','Тест'],[60,'Адрес','Россия'],[90,'БИК','123456789']]);
 layout.textAnnotations.push({description:'Нечитаемая геометрия'});
 const r=recoverRequisiteLayout(layout);
 assert.equal(r.unsupportedWords,1);assert.equal(r.wordCoverageComplete,false);
 assert.equal(r.sourceText,layout.text);assert.ok(r.warnings.some(w=>w.includes('координат')));
});
