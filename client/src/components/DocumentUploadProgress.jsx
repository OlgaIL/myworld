import { useEffect, useState } from "react";
import { uploadCountsLabel, uploadPageLabel } from "../utils/documentUploadProgress";
import "./DocumentUploadProgress.css";

export function DocumentUploadProgress({view, compact=false}) {
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{if(!view.active||!view.updatedAt)return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[view.active,view.updatedAt]);
  if (!view.visible && !view.reason) return null;
  return <div className={`document-upload-progress${compact?" document-upload-progress--compact":""}`} role="status" aria-live="polite">
    <p>{(view.active || view.processing > 0) && <span className="gallery__upload-spinner" aria-hidden="true"/>}<span>{uploadCountsLabel(view)}</span></p>
    {view.reason && <p id={compact?undefined:"document-upload-blocked"} className="document-upload-progress__reason">{view.reason} Добавление, изменение порядка и удаление временно недоступны.</p>}
    {view.active&&view.updatedAt&&now-view.updatedAt>=45000&&<p>Ответ сервера занимает больше времени. Ожидаем подтверждения; состояние страниц обновляется автоматически.</p>}
    {(view.errors > 0 || view.notUploaded > 0) && <p className="document-upload-progress__warning">{view.notUploaded?"Не все фотографии загружены.":"Есть страницы с ошибкой."} {compact?"Откройте документ, чтобы увидеть подробности.":"Проверьте состояние каждой страницы ниже."}</p>}
  </div>;
}

export function PendingDocumentPage({page, index, total}) {
  const working = ["preparing", "uploading", "processing"].includes(page.uploadPhase);
  const problem = ["interrupted", "failed", "not_started"].includes(page.uploadPhase);
  const label = uploadPageLabel(page);
  return <section className="multipage-preview__page document-upload-page" id={`document-page-${page.pageId}`} data-upload-pending={page.pageId}>
    <header className="multipage-preview__page-header">{index>0&&<div className="multipage-preview__page-description"><h3>Название загружается…</h3></div>}<div className="multipage-preview__page-tools"><strong>Страница {index+1} из {total}</strong></div></header>
    <div className={`document-upload-page__status${problem?" document-upload-page__status--error":""}`} role="status">{label}</div>
    <div className="document-page__layout"><div className="document-page__text document-upload-page__text"><p>{label}</p>{page.uploadMessage&&<p>{page.uploadMessage}</p>}</div>
      <aside className="document-page__side"><div className="document-upload-page__preview">{page.previewUrl&&<img src={page.previewUrl} alt={`Фото страницы ${index+1}`}/>}<div className="gallery__upload-overlay">{working?<span className="gallery__upload-spinner" aria-hidden="true"/>:<span>{problem?"Не загружено":"В очереди"}</span>}</div></div></aside></div>
  </section>;
}
