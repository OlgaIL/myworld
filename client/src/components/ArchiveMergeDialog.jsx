import { useRef, useState } from "react";
import DocumentActionDialog from "./DocumentActionDialog";
import { mergeDocuments, documentErrorMessage } from "../services/documentsApi";
import "./MultipageDocument.css";
import { DOCUMENT_PAGE_LIMIT } from "../../../shared/documentLimits.mjs";

export default function ArchiveMergeDialog({selection,onClose,onMerged}) {
  const [pages,setPages]=useState(selection.sources),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const request=useRef(null);
  async function confirm(){
    if(busy)return;setBusy(true);setError("");
    request.current ||= {operationId:crypto.randomUUID(),sources:selection.sources.map(p=>({documentId:p.documentId,expectedVersion:p.structureVersion})),orderedPageIds:pages.map(p=>p.coverPageId)};
    try{await mergeDocuments(request.current);await onMerged();}catch(e){setError(documentErrorMessage(e));}finally{setBusy(false);}
  }
  return <DocumentActionDialog title="Объединить в один документ?" onClose={onClose} busy={busy} footer={<><button className="confirm-modal__button confirm-modal__button--secondary" disabled={busy} onClick={onClose}>Отмена</button><button className="confirm-modal__button" disabled={busy||pages.length>DOCUMENT_PAGE_LIMIT} onClick={confirm}>{busy?"Объединяем…":"Объединить"}</button></>}>
    <p>Название и описание — из первой страницы. Объединение бесплатно; позже документ можно разделить.</p><p>Используйте кнопки выше/ниже.</p>
    {pages.length>DOCUMENT_PAGE_LIMIT&&<p className="document-improvement__error">В одном документе может быть не больше {DOCUMENT_PAGE_LIMIT} страниц.</p>}
    <ol className="document-merge-order">{pages.map((p,index)=><li key={p.documentId}><img src={p.url} alt=""/><span>Страница {index+1} · {p.displayTitle||p.title}</span><div>{[-1,1].map(shift=><button className="document-page__back" key={shift} disabled={busy||Boolean(request.current)||(shift<0?!index:index===pages.length-1)} aria-label={`${shift<0?"Поднять":"Опустить"} страницу ${index+1}`} onClick={()=>setPages(prev=>{const next=[...prev];[next[index],next[index+shift]]=[next[index+shift],next[index]];return next;})}>{shift<0?"↑":"↓"}</button>)}</div></li>)}</ol>
    {error&&<p className="document-improvement__error" role="alert">{error}</p>}
  </DocumentActionDialog>;
}
