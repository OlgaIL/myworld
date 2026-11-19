import { useEffect, useRef, useState } from "react";
import { prepareImageForUpload } from "../utils/prepareImageForUpload";
import { processPhoto } from "../services/api";
import { beginUpload, storeUploadItem, getUpload, closeUpload, documentErrorMessage } from "../services/documentsApi";
import { trackGoal } from "../services/analytics";
import { DOCUMENT_PAGE_LIMIT, DOCUMENT_UPLOAD_BATCH_LIMIT } from "../../../shared/documentLimits.mjs";

export function useDocumentUpload({user,reloadPhotos,reloadUser,recordUploadAllowed,batchContext,onDocumentCreated,onPageReady,onUploadStarted}) {
  const [selection,setSelection]=useState(null),[uploading,setUploading]=useState(false),[uploadMessage,setUploadMessage]=useState("");
  const [pendingPhotos,setPendingPhotos]=useState([]),[error,setError]=useState("");
  const [activeUpload,setActiveUpload]=useState(null);
  const [session,setSession]=useState(null);
  const inFlight=useRef(false),urls=useRef(new Set());
  useEffect(()=>()=>{for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();},[]);
  const available=Number(user?.totalRemaining||0),unlimited=user?.unlimitedAccess||user?.extendedAccessActive;
  function clearSelection(){if(inFlight.current)return;setSelection(null);setSession(null);setError("");for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();}
  function handleUpload(event,context={}){
    const files=Array.from(event.target.files||[]);event.target.value="";
    if(!files.length||inFlight.current||!user)return;
    clearSelection();
    const items=files.map((file,index)=>{const url=URL.createObjectURL(file);urls.current.add(url);return {file,url,name:`pending-${crypto.randomUUID()}`,ordinal:index+1};});
    const nextSelection={items,mode:context.mode||"group",context};
    if(files.length===1)void startUpload(nextSelection);
    else setSelection(nextSelection);
    if(files.length>1)trackGoal("account_batch_selected",{source:batchContext?.source||"cabinet_upload",placement:batchContext?.placement||"cabinet",file_count:files.length});
  }
  function chooseMode(mode){setSelection(s=>({...s,mode}));}
  function selectionErrors(current){
    return {
      balanceError:current&&!unlimited&&current.items.length>available
        ? `1 фото — 1 обработка. Вы выбрали ${current.items.length} фото, а доступно ${available} обработок. Выберите не больше ${available} фото или пополните баланс.` : "",
      limitError:current&&(current.items.length>DOCUMENT_UPLOAD_BATCH_LIMIT||current.mode!=="separate"&&current.items.length+(current.context.existingPages||0)>DOCUMENT_PAGE_LIMIT)
        ? (current.items.length>DOCUMENT_UPLOAD_BATCH_LIMIT?`За одну загрузку можно выбрать до ${DOCUMENT_UPLOAD_BATCH_LIMIT} фото.`:`В одном документе может быть не больше ${DOCUMENT_PAGE_LIMIT} страниц.`) : ""
    };
  }
  const {balanceError,limitError}=selectionErrors(selection);
  function confirmUpload(){return startUpload(selection);}
  async function startUpload(current){
    if(!current||inFlight.current)return;
    const errors=selectionErrors(current);
    if(errors.balanceError||errors.limitError||!recordUploadAllowed){setSelection(current);return;}
    inFlight.current=true;setUploading(true);setError("");
    setSelection(null);
    const items=current.items.map(i=>({name:i.name,url:i.url,itemId:crypto.randomUUID(),ordinal:i.ordinal,phase:"queued"}));
    setSession({mode:current.mode,documentId:current.context.targetDocumentId,active:true,updatedAt:Date.now(),items});
    const updateItem=(name,changes)=>setSession(prev=>({...prev,updatedAt:Date.now(),items:prev.items.map(i=>i.name===name?{...i,...changes}:i)}));
    if(current.mode==="group")onUploadStarted?.();
    setPendingPhotos(current.items.map((i,index)=>({...i,isPendingUpload:true,uploadMessage:index?"Ожидает загрузки…":"Подготавливаем фото…"})));
    setActiveUpload({pendingName:current.items[0].name,url:current.items[0].url,documentId:current.context.targetDocumentId,
      phase:"preparing",label:"Подготавливаем фото…"});
    let batch=null,finished=false,currentItem=null;
    try{
      setUploadMessage("Подготавливаем фотографии…");
      // Freeze metadata only after the existing preparation step (HEIC/resize/
      // EXIF conversion). The server compares the exact transmitted bytes.
      const prepared=[];
      for(const [index,item] of current.items.entries()){
        currentItem=item;updateItem(item.name,{phase:"preparing"});
        prepared.push({...item,file:await prepareImageForUpload(item.file),itemId:items[index].itemId});
        updateItem(item.name,{phase:"queued"});
      }
      const body={batchId:crypto.randomUUID(),mode:current.mode,...current.context,
        items:prepared.map((i,index)=>({itemId:i.itemId,ordinal:index+1,name:i.file.name,size:i.file.size,mimeType:i.file.type}))};
      try{batch=await beginUpload(body);}catch(startError){batch=await getUpload(body.batchId).catch(()=>null);if(!batch)throw startError;}
      setSession(prev=>({...prev,batchId:batch.batchId}));
      for(const [index,item] of prepared.entries()){
        currentItem=item;updateItem(item.name,{phase:"uploading"});
        const uploadLabel=prepared.length===1?"Загружаем фото…":`Загружаем фото ${index+1} из ${prepared.length}…`;
        setUploadMessage(uploadLabel);
        setActiveUpload({pendingName:item.name,url:item.url,documentId:batch.targetDocumentId||current.context.targetDocumentId,
          phase:"uploading",label:uploadLabel});
        setPendingPhotos(prev=>prev.map(p=>p.name===item.name?{...p,uploadMessage:uploadLabel}:p));
        let stored;
        try{stored=await storeUploadItem(batch.batchId,item.itemId,item.file);}
        catch(uploadError){
          // A lost response can still mean COMMIT succeeded. Read its slot;
          // never POST a fresh key or run recognition twice automatically.
          const saved=await getUpload(batch.batchId).catch(()=>null);
          if(saved?.items.find(i=>i.itemId===item.itemId)?.state!=="stored")throw uploadError;
          stored=saved;
        }
        batch=stored;const saved=stored.items.find(i=>i.itemId===item.itemId);
        if(!saved?.filename)throw new Error("UPLOAD_CONFIRMATION_UNAVAILABLE");
        const pageTotal=current.mode==="replace"?current.context.documentPageCount:current.mode==="append"?current.context.existingPages+prepared.length:prepared.length;
        const processingLabel=current.mode==="separate"?(prepared.length===1?"Обрабатываем фото…":`Обрабатываем фото ${index+1} из ${prepared.length}…`)
          :`Обрабатываем страницу ${saved.position}${pageTotal?` из ${pageTotal}`:""}…`;
        const pageProgress={pendingName:item.name,url:item.url,documentId:saved.documentId,pageId:saved.photoId,filename:saved.filename};
        setSession(prev=>({...prev,updatedAt:Date.now(),documentId:current.mode==="separate"?null:saved.documentId,
          items:prev.items.map(i=>i.name===item.name?{...i,filename:saved.filename,pageId:saved.photoId,phase:user.processingAllowed?"processing":"done",status:"uploaded"}:i)}));
        setActiveUpload({...pageProgress,phase:user.processingAllowed?"processing":"stored",label:user.processingAllowed?processingLabel:"Фотография загружена."});
        setPendingPhotos(prev=>prev.map(p=>p.name===item.name?{...p,serverName:saved.filename,uploadMessage:user.processingAllowed?processingLabel:"Фотография загружена."}:p));
        if(current.mode!=="separate")onPageReady?.(saved.documentId,saved.photoId,{first:index===0});
        if(user.processingAllowed){
          setUploadMessage(processingLabel);
          const result=await processPhoto(saved.filename);
          updateItem(item.name,{phase:"done",status:result.status||"recognized"});
          if(result.status==="processed"){
            trackGoal("account_upload_success",{source:"cabinet_upload",...(prepared.length>1?{file_count:prepared.length,batch_source:batchContext?.source||"cabinet_upload",batch_placement:batchContext?.placement||"cabinet"}:{})});
            try{const ordinal=Number(sessionStorage.getItem("word2you_post_auth_follow_up")||0);if(ordinal>0){sessionStorage.removeItem("word2you_post_auth_follow_up");trackGoal("post_auth_follow_up_processing_success",{source:"post_auth_next_step",processing_ordinal:ordinal});}}catch{ /* Optional analytics storage. */ }
          }
        }
        setPendingPhotos(prev=>prev.filter(p=>p.name!==item.name));
        await Promise.all([reloadPhotos(),reloadUser()]);
        setActiveUpload({...pageProgress,phase:"stored",label:user.processingAllowed?"Показываем результат…":""});
      }
      batch=await closeUpload(batch.batchId);finished=true;
      await Promise.all([reloadPhotos(),reloadUser()]);
      if(!onPageReady&&current.mode!=="separate"&&batch.targetDocumentId)onDocumentCreated?.(batch.targetDocumentId);
    }catch(uploadError){
      const message=documentErrorMessage(uploadError);setError(message);
      if(currentItem)updateItem(currentItem.name,{phase:uploadError.response?"failed":"interrupted",message});
    }
    finally{
      if(batch&&!finished)await closeUpload(batch.batchId).catch(()=>{});
      await Promise.allSettled([reloadPhotos(),reloadUser()]);
      setSession(prev=>prev?{...prev,active:false,items:prev.items.map(i=>["queued","preparing","uploading"].includes(i.phase)?{...i,phase:"not_started"}:i)}:prev);
      setPendingPhotos([]);
      setActiveUpload(null);setUploading(false);setUploadMessage("");inFlight.current=false;
    }
  }
  return {selection,uploading,uploadMessage,pendingPhotos,activeUpload,session,error,balanceError,limitError,pageLimit:DOCUMENT_PAGE_LIMIT,handleUpload,chooseMode,confirmUpload,clearSelection};
}
