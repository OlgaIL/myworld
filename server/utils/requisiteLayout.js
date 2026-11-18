// Experimental reader, used only behind the local processing feature flag.
// Geometry proposes associations; format checks never select, rewrite or move values.
const median = values => { const v=[...values].sort((a,b)=>a-b);return v.length ? v[Math.floor(v.length/2)] : 0; };
const key = s => String(s).toLowerCase().replaceAll('ё','е').replace(/[^\p{L}\p{N}]/gu,'');
const aliases = new Map(Object.entries({
 recipient:['получатель','получательсредств'], bank:['банкполучателя','beneficiarybank','beneficarybank'],
 correspondent_bank:['correspondentbank','банккорреспондент'],
 address:['адрес','address','adress'], correspondent_account:['коррсчет','корреспондентскийсчет','кс'],
 account:['счетполучателя','расчетныйсчет','номерсчетадержателякарты','номеркартсчета'],
 purpose:['назначениеплатежа'], bik:['бик','мфо'], inn:['инн','рма'], swift:['swift'],
 cardholder:['cardholdersname','имядержателякарты']
}).flatMap(([type, names])=>names.map(name=>[name,type])));

export function validateRequisite(type, raw, country='unknown') {
 const value=String(raw??''),compact=value.replace(/\s/gu,'');
 const result={status:'not_checked',country,raw:value,compact,characters:compact.length,checks:[],warnings:[]};
 if(!compact){result.status='missing';result.warnings.push('Поле пустое; значение не подставлялось.');return result;}
 const numeric=['bik','inn','account','correspondent_account'].includes(type);
 if(numeric&&!/^\d+$/u.test(compact)){
  result.status='mismatch';result.checks.push('Только цифры');result.warnings.push('Есть символы, отличные от цифр. Исходное значение сохранено.');return result;
 }
 if(type==='swift') {
  result.checks.push('8 или 11 символов; структура BIC по ISO 9362');
  result.status=/^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/u.test(compact)?'format_match':'mismatch';
 }else if(numeric){
  result.checks.push('Только цифры');
  const length=type==='inn'?(country==='RU'?[10,12]:country==='TJ'?[9]:null)
   :type==='bik'?(country==='RU'?[9]:null)
   :country==='RU'?[20]:null;
  if(length){result.checks.push(`Длина: ${length.join(' или ')}`);result.status=length.includes(compact.length)?'format_match':'mismatch';}
  else {result.status='profile_required';result.warnings.push('Страновая длина для этого поля не задана; значение не отклонено по российскому шаблону.');}
 }
 if(result.status==='mismatch')result.warnings.push('Формат не совпал; цифры и буквы не исправлялись.');
 if(result.status==='format_match')result.warnings.push('Совпадает только формат. Существование реквизита, контрольная сумма и принадлежность банку не проверены.');
 return result;
}

function wordsOf(layout) {
 return (layout?.textAnnotations||[]).slice(1).flatMap((a,i)=>{
  const p=a?.boundingPoly?.vertices;
  if(!Array.isArray(p)||p.length!==4||!String(a.description||'').trim())return [];
  const xs=p.map(v=>Number(v.x??0)),ys=p.map(v=>Number(v.y??0));
  if(![...xs,...ys].every(Number.isFinite))return [];
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  if(right<=left||bottom<=top)return [];
  return [{id:i+1,text:a.description,left,right,top,bottom,x:median(xs),y:ys.reduce((n,v)=>n+v,0)/4,
   height:bottom-top,slope:(p[1].x-p[0].x)>12?(p[1].y-p[0].y)/(p[1].x-p[0].x):null}];
 });
}
const join = words => words.map(w=>w.text).join(' ').replace(/\s+([,.;:!?%)])/gu,'$1').replace(/([(])\s+/gu,'$1').trim();
function labelOf(words) {
 let found=null;
 for(let n=1;n<=Math.min(words.length,10);n++){
  const text=join(words.slice(0,n)),k=key(text);
  const type=aliases.get(k)||(/^accountin\p{L}+$/u.test(k)?'account':null);
  if(type)found={type,text,count:n};
 }
 return found;
}
function explicitCountry(text) {
 const s=String(text).toLowerCase();
 if(/таджикистан|tajikistan|тоҷикистон/u.test(s))return 'TJ';
 if(/росси[яий]|russia|(?:^|[^\p{L}])рф(?:$|[^\p{L}])/u.test(s))return 'RU';
 if(/узбекистан|uzbekistan/u.test(s))return 'UZ';
 return null;
}

export function recoverRequisiteLayout(layout,{country='unknown'}={}) {
 const words=wordsOf(layout),height=median(words.map(w=>w.height));
 const sourceCount=Math.max(0,(layout?.textAnnotations||[]).length-1);
 const base={version:1,status:'not_applicable',sections:[],unplacedLines:[],warnings:[],sourceText:String(layout?.text??layout?.rawText??''),sourceWords:Math.max(0,sourceCount),
  coveredWords:words.length,unsupportedWords:Math.max(0,sourceCount-words.length),requiresReview:true,wordCoverageComplete:words.length===sourceCount};
 if(base.unsupportedWords)base.warnings.push('У части слов нет пригодных координат; полный исходный текст сохранён отдельно.');
 if(words.length<6||!height){base.warnings.push('Недостаточно координат.');return base;}
 const skew=median(words.map(w=>w.slope).filter(n=>Number.isFinite(n)&&Math.abs(n)<0.4));
 for(const w of words)w.rowY=w.y-skew*((w.left+w.right)/2);
 const lines=[];
 for(const w of [...words].sort((a,b)=>a.rowY-b.rowY||a.left-b.left)){
  let line=lines.filter(l=>Math.abs(l.y-w.rowY)<=Math.min(height,w.height)*0.43)
   .sort((a,b)=>Math.abs(a.y-w.rowY)-Math.abs(b.y-w.rowY))[0];
  if(!line){line={y:w.rowY,words:[]};lines.push(line);}
  line.words.push(w);line.y=median(line.words.map(a=>a.rowY));
 }
 lines.sort((a,b)=>a.y-b.y);
 for(const l of lines){l.words.sort((a,b)=>a.left-b.left);l.text=join(l.words);l.label=labelOf(l.words);}
 const anchors=lines.filter(l=>l.label&&l.words[0].left<(layout.width||Math.max(...words.map(w=>w.right)))*0.48);
 if(anchors.length<3){base.unplacedLines=lines.map(l=>({text:l.text,wordIds:l.words.map(w=>w.id)}));base.warnings.push('Недостаточно подписей реквизитов; обычный текст не преобразован.');return base;}
 const leftStart=median(anchors.map(l=>l.words[0].left));
 const width=layout.width||Math.max(...words.map(w=>w.right));
 let section=null,lastField=null,scopeCountry=country,lastY=-Infinity;
 const used=new Set();
 const claim=ws=>ws.forEach(w=>used.add(w.id));
 const unplaced=l=>base.unplacedLines.push({text:l.text,wordIds:l.words.map(w=>w.id),left:l.words[0].left,y:l.y});
 const makeSection=()=>{section={id:`section-${base.sections.length+1}`,fields:[],extraLines:[]};base.sections.push(section);lastField=null;scopeCountry=country;};
 for(const l of lines){
  let label=l.label;
  if(l.words[0].left>width*0.48)label=null;
  const isHeading=/^\d+[.)]?\s*(?:Для перевода|For transfer)/iu.test(l.text);
  // Unknown labels remain visible if they occupy the same left lane and have a clear gap.
  if(!label&&!isHeading&&section&&Math.abs(l.words[0].left-leftStart)<Math.max(55,width*0.08)){
   let gap=-1;
   for(let i=0;i<l.words.length-1;i++)if(l.words[i+1].left-l.words[i].right>height*2.5){gap=i;break;}
   if(gap>=0&&l.words[gap+1].left>width*0.35)label={type:'unknown',text:join(l.words.slice(0,gap+1)),count:gap+1};
  }
  if(label){
   const labelWords=l.words.slice(0,label.count),valueWords=l.words.slice(label.count);
   const continuation=lastField&&!lastField.value&&/^\(/u.test(label.text)&&l.y-lastY<height*3;
   const root=['recipient','correspondent_bank'].includes(label.type);
   const repeated=section?.fields.length>=2&&key(section.fields[0].label)===key(label.text);
   if(!section||(!continuation&&((root&&section.fields.length>=2)||(repeated&&l.y-lastY>height*2.2))))makeSection();
   if(continuation){
    lastField.label+=' '+label.text;lastField.labelWordIds.push(...labelWords.map(w=>w.id));
    lastField.value=join(valueWords);lastField.valueWordIds.push(...valueWords.map(w=>w.id));
    if(valueWords.length)lastField.valueLeft=valueWords[0].left;
    claim(l.words);lastY=l.y;continue;
   }
   const geometryWarnings=[];
   if(valueWords.length&&valueWords[0].left-labelWords.at(-1).right<height*0.5)geometryWarnings.push('Малый промежуток между подписью и значением; связь требует сверки.');
   // Two candidate values on the same row are retained, never selected by length.
   const valueGroups=[];let group=[];
   for(const w of valueWords){if(group.length&&w.left-group.at(-1).right>height*2.5){valueGroups.push(group);group=[];}group.push(w);}
   if(group.length)valueGroups.push(group);
   if(valueGroups.length>1&&valueGroups.every(g=>/^[A-Z0-9\s]+$/u.test(join(g))))geometryWarnings.push('В строке несколько отдельных кандидатов; автоматически выбирать нельзя.');
   if(['bank','correspondent_bank'].includes(label.type))scopeCountry=country;
   const explicit=explicitCountry(join(valueWords));if(explicit)scopeCountry=explicit;
   lastField={id:`field-${l.words[0].id}`,type:label.type,label:label.text,value:join(valueWords),
    labelWordIds:labelWords.map(w=>w.id),valueWordIds:valueWords.map(w=>w.id),
    valueLeft:valueWords[0]?.left??null,country:scopeCountry,geometryWarnings};
   // Wrapped text may start just above its label after perspective skew.
   const previous=base.unplacedLines.at(-1);
   if(previous&&valueWords.length&&['bank','correspondent_bank'].includes(label.type)
    &&previous.left>width*0.35&&Math.abs(previous.left-valueWords[0].left)<height*2
    &&l.y-previous.y>0&&l.y-previous.y<height*1.8
    &&!/^\d+[.)]?\s*(?:Для перевода|For transfer)/iu.test(previous.text)){
    base.unplacedLines.pop();section.extraLines=section.extraLines.filter(t=>t!==previous.text);
    lastField.value=previous.text+'\n'+lastField.value;lastField.valueWordIds.unshift(...previous.wordIds);
    previous.wordIds.forEach(id=>used.add(id));
    lastField.geometryWarnings.push('Перенесённая строка над подписью присоединена по координатам; требуется сверка.');
   }
   section.fields.push(lastField);claim(l.words);lastY=l.y;
  }else{
   const explicit=explicitCountry(l.text);
   const textual=lastField&&['bank','correspondent_bank','address','recipient','cardholder','unknown'].includes(lastField.type);
   const looksSeparateAddress=lastField&&['bank','correspondent_bank'].includes(lastField.type)
    &&(/^(?:\d{1,6}\s|Таджикистан|Россия)/iu.test(l.text)||/\b(?:ave\.|street)|(?:пр\.|ул\.)/iu.test(l.text));
   const rightContinuation=textual&&lastField.valueLeft!==null&&l.words[0].left>=lastField.valueLeft-height*1.5&&l.y-lastY<height*1.65;
   if(rightContinuation&&!isHeading&&!looksSeparateAddress){
    lastField.value+='\n'+l.text;lastField.valueWordIds.push(...l.words.map(w=>w.id));
    if(explicit){scopeCountry=explicit;lastField.country=explicit;}
    lastField.geometryWarnings.push('Многострочное значение объединено по координатам; требуется сверка.');claim(l.words);lastY=l.y;
   }else{
    unplaced(l);
    if(section)section.extraLines.push(l.text);
    // A separate bank/address line may explicitly change country within a section.
    if(explicit&&section&&l.words[0].left>width*0.35)scopeCountry=explicit;
    if(isHeading)lastField=null;
   }
  }
 }
 for(const s of base.sections)for(const f of s.fields){
  f.validation=validateRequisite(f.type,f.value,f.country);
  f.status=!f.value?'missing':f.geometryWarnings.length?'review':f.validation.status==='mismatch'?'mismatch':'candidate';
 }
 const unplacedIds=base.unplacedLines.flatMap(l=>l.wordIds);
 const allIds=[...used,...unplacedIds];
 if(allIds.length!==words.length||new Set(allIds).size!==words.length)throw Error('OCR word coverage mismatch');
 base.status='review';base.skew=skew;base.wordCoverageComplete=words.length===sourceCount;
 base.warnings.push('Экспериментальная раскладка. Все связи требуют визуальной сверки; совпадение формата не доказывает правильность реквизита.');
 return base;
}
