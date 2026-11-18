import { useCallback, useEffect, useRef, useState } from "react";
import { listDocuments, deleteDocuments } from "../services/documentsApi";
import { getPhotoUrl } from "../services/api";

export function archiveDocumentPhotos(documents,photos) {
  if(!documents)return [];
  const byName=new Map(photos.map(p=>[p.name,p]));
  return documents.map(doc=>{
    const cover=byName.get(doc.coverFilename)||{};
    const counts=doc.statusCounts||{};
    const status=counts.processing?"processing":counts.processed===doc.pageCount?"processed":counts.processed||counts.recognized?"recognized":Object.keys(counts)[0]||"uploaded";
    return {...cover,...doc,name:`d-${doc.id}`,documentId:doc.id,coverName:doc.coverFilename,url:doc.coverUrl||cover.url||getPhotoUrl(doc.coverFilename),
      status,createdAt:doc.archiveAt,searchText:doc.searchPages?.map(p=>[p.title,p.summary,p.text,p.cleanText,...(p.tags||[])].join(" ")).join(" ")||""};
  });
}
export function useDocuments(userId,photos) {
  const [documents,setDocuments]=useState(null),[error,setError]=useState("");
  const generation=useRef(0),docsRef=useRef([]);
  const readSequence=useRef(0);
  const invalidate=useCallback(()=>{generation.current+=1;},[]);
  const reloadDocuments=useCallback(async()=>{
    if(!userId)return [];
    const current=generation.current;
    const sequence=++readSequence.current;
    const result=await listDocuments();
    if(current===generation.current&&sequence===readSequence.current){docsRef.current=result.documents;setDocuments(result.documents);setError("");}
    return result.documents;
  },[userId]);
  useEffect(()=>{invalidate();docsRef.current=[];setDocuments(null);setError("");return invalidate;},[userId,invalidate]);
  useEffect(()=>{if(userId)reloadDocuments().catch(()=>setError("Не удалось загрузить документы. Обновите страницу."));},[userId,photos,reloadDocuments]);
  async function removeDocuments(names,onProgress=()=>{}) {
    const selected=new Set(names),sources=docsRef.current.filter(d=>selected.has(`d-${d.id}`));
    const result={deleted:[],missing:names.filter(n=>!sources.some(d=>`d-${d.id}`===n)),failed:[],cleanupPending:false};
    let chunk=[],pageCount=0,done=0;
    async function flush(){
      if(!chunk.length)return;
      const answer=await deleteDocuments({operationId:crypto.randomUUID(),documents:chunk.map(d=>({id:d.id,expectedVersion:d.structureVersion}))});
      result.deleted.push(...answer.deleted.map(id=>`d-${id}`));result.missing.push(...answer.missing.map(id=>`d-${id}`));
      result.failed.push(...answer.failed.map(f=>({name:`d-${f.id}`,code:f.code})));result.cleanupPending||=answer.cleanupPending;
      done+=chunk.length;onProgress(done);chunk=[];pageCount=0;
    }
    try{for(const doc of sources){if(chunk.length===100||pageCount+doc.pageCount>500)await flush();chunk.push(doc);pageCount+=doc.pageCount;}await flush();}
    catch(error){result.failureCode=error.response?.data?.error||"DELETE_CONFIRMATION_UNAVAILABLE";}
    await reloadDocuments();return result;
  }
  return {documents,error,reloadDocuments,removeDocuments};
}
