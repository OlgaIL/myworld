import { cloneElement, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DocumentPage from "./DocumentPage";
import DocumentActionDialog from "./DocumentActionDialog";
import DocumentPageNavigation from "./DocumentPageNavigation";
import ImprovementRequestModal from "./ImprovementRequestModal";
import { useImprovementRequest } from "../hooks/useImprovementRequest";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { getPhotoUrl, processPhoto, setPhotoCorrectionApplied } from "../services/api";
import * as api from "../services/documentsApi";
import { combineDocumentCopy } from "../utils/documentCopy";
import { getDocumentDisplayTitle } from "../utils/documentTitle";
import { getPhotoStatusMeta } from "../constants/documentStatuses";
import { documentUploadView } from "../utils/documentUploadProgress";
import { DocumentUploadProgress, PendingDocumentPage } from "./DocumentUploadProgress";
import "./MultipageDocument.css";

const pageCount=n=>`${n} ${n%100>=11&&n%100<=14?"страниц":n%10===1?"страница":[2,3,4].includes(n%10)?"страницы":"страниц"}`;
export function CopyAllButton({disabled,label="Скопировать всё",copied=false,onClick}) {
  return <button className="multipage-preview__copy-all multipage-preview__layered" disabled={disabled} onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{copied?<path d="M5 12l4 4L19 6"/>:<><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></>}</svg><span className="multipage-preview__copy-label"><span aria-hidden="true" className="multipage-preview__copy-label-space">{label}</span><span aria-live="polite">{copied?"Скопировано":label}</span></span></button>;
}
function GroupPage({page,user,embedded,onOpenImage,onBack,reload,onReport,tab,onTab,initialTab,autoRestoreTables,onReplace,metaActions,processingMessage,sideFooter,blocked=false}) {
  const {copiedMap,copyText}=useCopyFeedback();
  const improvement=useImprovementRequest(page.filename,true);
  const [requestOpen,setRequestOpen]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState("");
  const report=useCallback(variant=>onReport(page.filename,variant),[onReport,page.filename]);
  const changeTab=useCallback(value=>onTab(page.filename,value),[onTab,page.filename]);
  async function act(action){if(working)return;setWorking(true);setError("");try{await action();await reload();}catch(e){setError(api.documentErrorMessage(e));}finally{setWorking(false);}}
  const noText=Boolean(processingMessage)||["error","no_text","uploaded","processing"].includes(page.status)&&!(page.cleanText||page.text||"").trim();
  useEffect(()=>{if(noText)onReport(page.filename,{id:"text",text:"",formattedAvailable:false,pending:false});},[noText,onReport,page.filename]);
  const reloadImprovement=improvement.reloadRequest;
  useEffect(()=>{const timer=setInterval(reloadImprovement,20000);return()=>clearInterval(timer);},[reloadImprovement]);
  const textOverride=noText?<section className="document-page__text"><p role={processingMessage||page.status==="processing"?"status":undefined} aria-live="polite">{processingMessage||page.status==="processing"?"Обрабатываем фото…":page.status==="no_text"?"На фото не найден текст.":page.status==="uploaded"?"Фотография загружена. Обработка ещё не запущена.":"Не удалось обработать страницу."}</p>
    {page.uploadMessage&&<p className="document-improvement__error">{page.uploadMessage}</p>}
    {["error","no_text"].includes(page.status)&&<p>Обработка не списана.</p>}
    {error&&<p className="document-improvement__error" role="alert">{error}</p>}
    <div className="multipage-preview__actions">{["error","uploaded"].includes(page.status)&&<button className="document-improvement__button" disabled={working||blocked} onClick={()=>act(()=>processPhoto(page.filename))}>{working?"Обрабатываем…":"Повторить обработку"}</button>}
      {["error","no_text"].includes(page.status)&&<button className="document-page__back" disabled={working||blocked} onClick={()=>onReplace(page)}>Заменить фото</button>}</div></section>:undefined;
  return <><DocumentPage photo={{...page,name:page.filename,url:page.url||getPhotoUrl(page.filename)}} info={page} embedded={embedded} metaActions={metaActions} sideFooter={sideFooter}
    previewBusy={Boolean(processingMessage)||page.status==="processing"||working}
    onBack={onBack} onOpenImage={onOpenImage} copiedMap={copiedMap} onCopy={copyText} isAuthenticated
    packageRemaining={Number(user.packageRemaining||0)} giftRemaining={Number(user.giftRemaining||0)} tableTrialAvailable={Boolean(user.tableTrialAvailable)}
    improvementRequest={improvement.request} improvementRequestLoading={improvement.loading} improvementRequestError={improvement.error}
    onRequestImprovement={()=>setRequestOpen(true)} onRetryProcessing={()=>act(()=>processPhoto(page.filename))} retryProcessing={working} retryProcessingError={error}
    onToggleCorrection={correction=>act(()=>setPhotoCorrectionApplied(page.filename,correction.id,!correction.applied))}
    updatingCorrectionId={working?"pending":""} correctionError={error} onTableReady={reload}
    activeTextTab={tab} onTextTabChange={changeTab} onTextVariantReady={report} textOverride={textOverride}
    initialTextTab={initialTab} autoRestoreTables={autoRestoreTables} />
    {!noText&&["error","no_text"].includes(page.status)&&<div className="multipage-preview__actions"><span>Обработка не списана.</span>{page.status==="error"&&<button className="document-improvement__button" disabled={working||blocked} onClick={()=>act(()=>processPhoto(page.filename))}>Повторить обработку</button>}<button className="document-page__back" disabled={working||blocked} onClick={()=>onReplace(page)}>Заменить фото</button></div>}
    {requestOpen&&<ImprovementRequestModal submitting={improvement.submitting} error={improvement.error} onClose={()=>setRequestOpen(false)}
      onSubmit={async body=>{try{await improvement.submitRequest(body);setRequestOpen(false);await reload();}catch{/* Existing modal shows the error. */}}} />}
  </>;
}

export default function MultipageDocument({name,user,onBack,onOpenImage,reloadPhotos,reloadUser,upload,fallback,
  initialTextTab="text",autoRestoreTables=false}) {
  const input=useRef(null),inputContext=useRef(null),epoch=useRef(0),pageRoot=useRef(null),lastScrolled=useRef("");
  const {search}=useLocation();
  const navigate=useNavigate();
  const progress=upload.activeUpload,progressPageId=progress?.pageId,progressPhase=progress?.phase;
  const readSequence=useRef(0);
  const invalidate=useCallback(()=>{epoch.current+=1;},[]);
  const [loadedData,setData]=useState(null),[loadError,setLoadError]=useState("");
  const isDraft=name==="upload";
  const data=isDraft&&upload.session?{document:{id:"upload",archiveAt:new Date().toISOString(),structureVersion:"1",pageLimit:upload.pageLimit,
    availableActions:{delete:false,append:false}},pages:[]}:loadedData;
  const [dialog,setDialog]=useState(null),[draft,setDraft]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [tabs,setTabs]=useState({}),[reports,setReports]=useState({});
  const [archive,setArchive]=useState([]),[archiveIds,setArchiveIds]=useState([]);
  const [archiveAddedPages,setArchiveAddedPages]=useState([]);
  const {copiedMap:copyAllMap,copyText}=useCopyFeedback({durationMs:5000});
  const refresh=useCallback(async()=>{
    if(name==="upload")return null;
    const current=epoch.current;
    const sequence=++readSequence.current;
    const location=name.startsWith("d-")?{documentId:name.slice(2)}:await api.getDocumentLocation(name);
    const response=await api.getDocument(location.documentId);
    const next={...response,anchorPageId:response.anchorPageId||location.pageId};
    if(current===epoch.current&&sequence===readSequence.current){setData(next);setLoadError("");}
    return next;
  },[name]);
  useEffect(()=>{
    invalidate();let cancelled=false;
    refresh().catch(e=>{if(!cancelled)setLoadError(api.documentErrorMessage(e));});
    const timer=setInterval(()=>refresh().catch(e=>{if(!cancelled)setLoadError(api.documentErrorMessage(e));}),10000);
    return()=>{cancelled=true;invalidate();clearInterval(timer);};
  },[refresh,invalidate,upload.uploading,progressPageId,progressPhase]);
  const reload=useCallback(async()=>{await Promise.all([refresh(),reloadPhotos(),reloadUser()]);},[refresh,reloadPhotos,reloadUser]);
  const onReport=useCallback((filename,variant)=>setReports(prev=>JSON.stringify(prev[filename])===JSON.stringify(variant)?prev:{...prev,[filename]:variant}),[]);
  const onTab=useCallback((filename,value)=>setTabs(prev=>({...prev,[filename]:value})),[]);
  const activeDocumentId=data?.document?.id,anchorPageId=data?.anchorPageId;
  const pageIds=data?.pages.map(p=>p.pageId).join(",");
  const progressPendingName=progress?.documentId===activeDocumentId?progress?.pendingName:null;
  useEffect(()=>{
    if(!activeDocumentId)return;
    const anchor=new URLSearchParams(search).get("page")||progressPageId||anchorPageId;
    const currentItem=upload.session?.items.find(i=>i.name===progressPendingName);
    const pending=currentItem?pageRoot.current?.querySelector(`[data-upload-pending="${currentItem.pageId||`upload-${currentItem.itemId}`}"]`):null;
    const target=progressPendingName&&pending?pending:anchor?(document.getElementById(`document-page-${anchor}`)||pageRoot.current?.querySelector('.document-page__text')):null;
    const key=`${activeDocumentId}:${progressPendingName||anchor}:${progressPendingName&&pending?"pending":"page"}`;
    if(target&&lastScrolled.current!==key){target.scrollIntoView({block:"start"});lastScrolled.current=key;}
  },[activeDocumentId,anchorPageId,search,progressPageId,progressPendingName,pageIds,upload.session?.items]);
  if(!data)return <main className="document-page"><button className="document-page__back" onClick={onBack}>Назад к списку</button><p>{isDraft?"Сведения о выбранных фотографиях доступны только во вкладке, где началась загрузка. Проверьте документ в архиве.":loadError||"Загружаем документ…"}</p>{loadError&&<button className="document-page__back" onClick={()=>refresh().catch(e=>setLoadError(api.documentErrorMessage(e)))}>Повторить</button>}</main>;
  const {document:doc}=data;
  const pageProcessing=page=>progress?.filename===page.filename&&(progress.phase==="processing"
    ||progress.phase==="stored"&&progress.label&&["uploaded","processing"].includes(page.status));
  const uploadView=documentUploadView(doc,data.pages,upload.session);
  const rows=uploadView.rows;
  const pages=rows.filter(page=>!page.placeholder).map(page=>pageProcessing(page)?{...page,status:"processing"}:page);
  const processingMessage=page=>pageProcessing(page)?progress.label:undefined;
  const uploadFooterMessage=progress?.documentId===doc.id?"":upload.uploadMessage;
  const blocked=busy||upload.uploading||!doc.availableActions.delete;
  const blockedHint=upload.uploading?"Дождитесь окончания загрузки.":busy?"Дождитесь завершения действия.":uploadView.reason;
  const singleLayout=rows.length===1&&!uploadView.visible;
  const processed=pages.filter(p=>p.status==="processed").length;
  const available=pages.filter(p=>reports[p.filename]?.text?.trim());
  const missing=available.length!==pages.length;
  const copyPending=pages.some(p=>reports[p.filename]?.pending);
  const status=getPhotoStatusMeta(pages.some(p=>p.status==="processing")?"processing":processed===pages.length?"processed":"recognized");
  function open(kind,extra={}){setError("");setDialog({kind,operationId:crypto.randomUUID(),version:doc.structureVersion,...extra});}
  function chooseFiles(mode="append",page){
    inputContext.current={mode,targetDocumentId:doc.id,expectedVersion:doc.structureVersion,documentPageCount:pages.length,...(page?{pageId:page.pageId}:{existingPages:pages.length})};
    input.current.multiple=mode!=="replace";input.current.click();
  }
  function openCopy(){
    const switched=[];const next={...tabs};
    pages.forEach((p,index)=>{const report=reports[p.filename];if(report?.id==="tables"&&report.formattedAvailable){next[p.filename]="formatted";switched.push(index+1);}});
    setTabs(next);open("copy",{switched});
  }
  async function archiveChoice(){
    try{const result=await api.listDocuments();setArchive(result.documents.filter(d=>d.id!==doc.id&&d.pageCount===1));setArchiveIds([]);open("archive");}catch(e){setError(api.documentErrorMessage(e));}
  }
  async function confirm(){
    if(busy)return;
    if(dialog.kind==="append"){setDialog(null);chooseFiles();return;}
    if(dialog.kind==="replace"){const page=dialog.page;setDialog(null);chooseFiles("replace",page);return;}
    if(dialog.kind==="copy"){
      const result=combineDocumentCopy(pages.map(p=>reports[p.filename]));
      if(!result.text){setError("В выбранных вкладках пока нет доступного текста.");return;}
      if(await copyText("all",result.text,result.html?{html:result.html}:undefined)){setDialog(null);setMessage("Текст скопирован.");}return;
    }
    let request=dialog.request;
    if(!request){
      request={operationId:dialog.operationId,expectedVersion:dialog.version};
      if(dialog.kind==="order")request.pageIds=draft.map(p=>p.pageId);
      if(dialog.kind==="extract")request.pageId=dialog.page.pageId;
      if(dialog.kind==="archive")request.sources=archive.filter(d=>archiveIds.includes(d.id)).map(d=>({documentId:d.id,expectedVersion:d.structureVersion}));
      setDialog(prev=>({...prev,request}));
    }
    setBusy(true);setError("");
    try{
      const action={order:api.reorderDocument,extract:api.extractPage,split:api.splitDocument,archive:api.appendArchiveDocuments}[dialog.kind];
      await action(doc.id,request);await reload();setDialog(null);
      if(dialog.kind==="archive"){
        const added=archive.filter(d=>request.sources.some(s=>s.documentId===d.id)).sort((a,b)=>new Date(a.archiveAt)-new Date(b.archiveAt)
          ||(BigInt(a.coverPageId)<BigInt(b.coverPageId)?-1:1));
        setArchiveAddedPages(added.map(d=>d.coverPageId));
        if(added[0]){const params=new URLSearchParams(search);params.set("page",added[0].coverPageId);navigate({search:`?${params}`},{replace:true});}
      }
      if(dialog.kind==="split")onBack();else if(dialog.kind==="extract")setMessage("Страница убрана из документа и сохранена отдельно в архиве.");
    }catch(e){setError(api.documentErrorMessage(e));await refresh().catch(()=>{});}finally{setBusy(false);}
  }
  const appendButton=<span className="document-upload-disabled" title={blockedHint||undefined}><button className="document-page__back multipage-preview__layered" disabled={blocked||!doc.availableActions.append} aria-describedby={blockedHint?"document-upload-blocked":undefined} onClick={()=>open("append")}>+ Добавить страницы</button></span>;
  const fab=<button className="fab-upload" disabled={blocked||!doc.availableActions.append} aria-label="Добавить страницы" aria-describedby={blockedHint?"document-upload-blocked":undefined} title={blockedHint||"Добавить страницы"} onClick={()=>open("append")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>;
  const useFallback=pages.length===1&&!name.startsWith("d-")&&fallback&&!processingMessage(pages[0]);
  const content=singleLayout?(useFallback?cloneElement(fallback,{metaActions:appendButton}):<GroupPage page={pages[0]} user={user} blocked={blocked} embedded={false} onBack={onBack} onOpenImage={onOpenImage} reload={reload}
    onReport={onReport} onTab={onTab} tab={tabs[pages[0].filename]} initialTab={initialTextTab} autoRestoreTables={autoRestoreTables} metaActions={appendButton} onReplace={page=>open("replace",{page})} processingMessage={processingMessage(pages[0])}/>):
    <main className="document-page"><button className="document-page__back" onClick={onBack}>Назад к списку</button>
      <div className="document-page__meta multipage-preview__meta"><div className="document-page__meta-details"><p className="gallery__date">{new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(doc.archiveAt))}</p>
        <p className={`gallery__status-badge ${uploadView.active?"gallery__status-badge--processing":status.badgeClassName}`}>{uploadView.active?"Загружается":processed===rows.length?status.label:pages.some(p=>p.status==="processing")?status.label:"Готово частично"}</p><span className="multipage-preview__page-count">{pageCount(rows.length)}</span></div><div className="document-page__meta-actions">{appendButton}</div></div>
      <section className="document-page__content multipage-preview__heading"><div className="multipage-preview__title-row"><h2>{getDocumentDisplayTitle({...doc,status:pages[0]?.status},"Название загружается…")}</h2><CopyAllButton disabled={blocked||!pages.length} copied={Boolean(copyAllMap.all)} onClick={openCopy} label={missing?"Скопировать доступный текст":"Скопировать всё"}/></div><p className="document-page__summary">{doc.summary}</p></section>
      {pages.length>1&&<div className="multipage-preview__actions"><button className="document-page__back" disabled={blocked} onClick={()=>{setDraft([...pages]);open("order");}}>Изменить порядок страниц</button><button className="document-page__back" disabled={blocked} onClick={()=>open("split")}>Разделить на документы</button></div>}
      <DocumentUploadProgress view={{...uploadView,reason:blockedHint}}/>
      {loadError&&<p role="alert" className="document-improvement__error">Не удалось обновить статусы. {loadError}</p>}
      {!uploadView.visible&&<p className="multipage-preview__counts">Загружено: {pages.length}, обработано: {processed}.</p>}
      <div className="document-navigation-layout">
      <DocumentPageNavigation pages={rows.map((page,index)=>({id:`document-page-${page.pageId}`,title:page.placeholder?`Страница ${index+1}: загрузка`:getDocumentDisplayTitle(page,`Страница ${index+1}`)}))}/>
      <div className="document-navigation-layout__pages">
      {rows.map((row,index)=>{const page=pages.find(p=>p.pageId===row.pageId)||row;return page.placeholder?<PendingDocumentPage key={page.pageId} page={page} index={index} total={rows.length}/>:<section className="multipage-preview__page" key={page.pageId} id={`document-page-${page.pageId}`}>
        <header className="multipage-preview__page-header">{index>0&&<div className="multipage-preview__page-description"><h3>{getDocumentDisplayTitle(page,`Страница ${index+1}`)}</h3>{page.summary&&<p className="document-page__summary">{page.summary}</p>}</div>}<div className="multipage-preview__page-tools"><strong>Страница {index+1} из {rows.length}</strong>{pages.length>1&&<button className="archive-action archive-action--link" disabled={blocked} onClick={()=>open("extract",{page,number:index+1})}>Убрать из документа</button>}</div></header>
        <div className="multipage-document__added-status" role="status"><span className={`gallery__status-badge ${getPhotoStatusMeta(page.status)?.badgeClassName||""}`}>{getPhotoStatusMeta(page.status)?.label||page.status}</span>{(page.addedFromArchive||archiveAddedPages.includes(page.pageId))&&<><span className="gallery__status-badge gallery__status-badge--processed">✓ Добавлена из архива</span><span>Обработки не списаны.</span></>}</div>
        <div className="multipage-document__embedded"><GroupPage page={page} user={user} blocked={blocked} embedded onBack={onBack} onOpenImage={onOpenImage} reload={reload} onReport={onReport} onTab={onTab} tab={tabs[page.filename]} initialTab={initialTextTab==="tables"&&(data.anchorPageId?page.pageId===data.anchorPageId:index===0)?"tables":"text"} autoRestoreTables={false} onReplace={page=>open("replace",{page})} processingMessage={processingMessage(page)} sideFooter={index===rows.length-1?<CopyAllButton disabled={blocked} copied={Boolean(copyAllMap.all)} onClick={openCopy} label={missing?"Скопировать доступный текст":"Скопировать всё"}/>:undefined}/></div>
      </section>})}

      </div></div>
    </main>;
  return <div data-multipage-preview className={rows.length>1?"multipage-document--navigable":undefined} ref={pageRoot}>
    {content}
    {singleLayout&&blockedHint&&<p id="document-upload-blocked" className="document-page multipage-document__message">{blockedHint}</p>}
    {fab}<input ref={input} className="upload-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>upload.handleUpload(event,inputContext.current)}/>
    {(message||error||loadError||uploadFooterMessage)&&<p className={`multipage-document__message ${error||loadError?"document-improvement__error":""}`} role="status">{error||loadError||uploadFooterMessage||message}</p>}
    {dialog&&<DocumentActionDialog title={dialog.kind==="copy"?"Скопировать текст?":dialog.kind==="append"?"Добавить страницы":dialog.kind==="replace"?"Заменить фото страницы?":dialog.kind==="extract"?`Убрать страницу ${dialog.number} из документа?`:dialog.kind==="order"?"Изменить порядок страниц":dialog.kind==="archive"?"Добавить из архива":"Разделить на отдельные документы?"} onClose={()=>setDialog(null)} busy={busy} scrollBody={dialog.kind==="archive"} footer={<>
      <button className="confirm-modal__button confirm-modal__button--secondary" disabled={busy} onClick={()=>setDialog(null)}>{dialog.kind==="copy"?"Вернуться к страницам":"Отмена"}</button>
      {dialog.kind==="append"&&<button className="confirm-modal__button confirm-modal__button--secondary" disabled={busy} onClick={archiveChoice}>Добавить из архива</button>}
      <button className="confirm-modal__button" disabled={busy||(dialog.kind==="copy"&&copyPending)||(dialog.kind==="archive"&&!archiveIds.length)} onClick={confirm}>{busy?(dialog.kind==="archive"?"Добавляем…":"Сохраняем…"):dialog.kind==="copy"?"Скопировать":["append","replace"].includes(dialog.kind)?"Выбрать фото":dialog.kind==="extract"?"Убрать":dialog.kind==="order"?"Сохранить порядок":dialog.kind==="archive"?"Добавить":"Разделить"}</button>
    </>}>
      {dialog.kind==="copy"?<><p>Скопируем содержимое всех открытых вкладок в буфер обмена.</p><p>Проверьте открытые вкладки.</p>{dialog.switched.length>0&&<p>На страницах {dialog.switched.join(", ")} вкладка «Таблицы» переключена на «Оформленный», чтобы скопировать текст вместе с таблицами.</p>}{missing&&<p>Текст есть у {available.length} из {pages.length} страниц. Скопируем только доступный текст.</p>}{copyPending&&<p role="status">Загружаем сохранённые таблицы…</p>}<p>Между страницами — пустая строка.<br/>Служебные названия и номера в копию не войдут.</p></>
        :dialog.kind==="append"?<p>Новые фотографии добавятся в конец документа.<br/>Обработка запускается только для новых фотографий.<br/>Максимум — {doc.pageLimit} страниц.</p>
        :dialog.kind==="extract"?<><p>Страница сохранится отдельной записью в архиве.<br/>Остальные страницы документа сохранят порядок.</p><p>При перемещении документов в Архив и обратно обработки не списываются.</p></>
        :dialog.kind==="replace"?<p>Новое фото займёт место этой страницы. Остальные страницы сохранят порядок. Новое фото обрабатывается по действующим правилам.</p>
        :dialog.kind==="split"?<p>Каждая из {pages.length} страниц станет отдельным документом.<br/>Фото и готовые результаты сохранятся.<br/>Обработки не списываются.</p>
        :dialog.kind==="archive"?<><p>Только одностраничные документы. Добавление бесплатно. Максимум — {doc.pageLimit} страниц.</p>{archive.length?archive.map(d=><label className="document-archive-choice" key={d.id}><input type="checkbox" checked={archiveIds.includes(d.id)} disabled={busy||Boolean(dialog.request)||!d.availableActions.merge} onChange={()=>setArchiveIds(prev=>prev.includes(d.id)?prev.filter(id=>id!==d.id):[...prev,d.id])}/>{d.displayTitle||d.title}</label>):<p>В архиве нет других одностраничных документов.</p>}</>
        :<><p>Используйте кнопки выше/ниже.</p><ol className="multipage-preview__order">{draft.map((page,index)=><li key={page.pageId}><img src={page.url||getPhotoUrl(page.filename)} alt=""/><span>Страница {index+1} · {page.displayTitle||page.title}</span><div>{[-1,1].map(shift=><button key={shift} className="document-page__back" disabled={busy||Boolean(dialog.request)||(shift<0?!index:index===draft.length-1)} aria-label={`${shift<0?"Поднять":"Опустить"} страницу ${index+1}`} onClick={()=>setDraft(prev=>{const next=[...prev];[next[index],next[index+shift]]=[next[index+shift],next[index]];return next;})}>{shift<0?"↑":"↓"}</button>)}</div></li>)}</ol></>}
      {busy&&dialog.kind==="archive"&&<p role="status">Добавляем страницы из архива…</p>}
      {error&&<p className="document-improvement__error" role="alert">{error}</p>}
    </DocumentActionDialog>}
  </div>;
}
