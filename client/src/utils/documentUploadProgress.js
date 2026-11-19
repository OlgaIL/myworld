const completeStatuses = new Set(["processed", "recognized", "no_text"]);

// A selected photo keeps its place until it is saved or explicitly reported as
// unfinished. A saved page replaces that place, rather than adding a second one.
export function documentUploadView(doc, pages = [], session = null) {
  const local = session && session.mode !== "separate" && session.mode !== "replace"
    && (session.documentId === doc.id || doc.id === "upload") ? session : null;
  const manifest = local || doc.uploadProgress;
  const active = Boolean(local?.active || doc.activity?.uploading);
  const items = (manifest?.items || []).map(item=>{
    const confirmed=local?.batchId&&local.batchId===doc.uploadProgress?.batchId
      ? doc.uploadProgress.items.find(i=>i.itemId===item.itemId) : null;
    return confirmed?{...confirmed,...item,filename:item.filename||confirmed.filename,pageId:item.pageId||confirmed.photoId}:item;
  }).filter(i => i.state !== "removed");
  const rows = pages.map(page => {
    const item = items.find(i => i.filename === page.filename || (i.pageId || i.photoId) === page.pageId);
    const phase = item?.phase;
    const status = completeStatuses.has(page.status) || page.status === "error" ? page.status
      : phase === "processing" && local?.active ? "processing"
      : phase === "done" ? item.status || page.status : page.status;
    return { ...page, status, uploadPhase: phase, uploadMessage: completeStatuses.has(status)||status==="error"?null:item?.message, previewUrl: item?.url };
  });
  for (const item of items) {
    if (pages.some(p => p.filename === item.filename || p.pageId === (item.pageId || item.photoId))) continue;
    // Stored pages moved to another document are not new missing uploads.
    if (!local && item.state === "stored") continue;
    rows.push({ pageId: item.pageId || `upload-${item.itemId}`, filename: item.filename,
      placeholder: true, previewUrl: item.url, ordinal: item.ordinal, status:item.filename?item.status:undefined,
      uploadPhase: item.phase || (item.state==="error"?"failed":active ? "queued" : "not_started"), uploadMessage: item.message });
  }
  const expected = rows.length;
  const uploaded = rows.filter(p => !p.placeholder || Boolean(p.filename)).length;
  const processed = rows.filter(p => completeStatuses.has(p.status)).length;
  const processing = rows.filter(p => p.status === "processing" || ["preparing", "uploading", "processing"].includes(p.uploadPhase) && p.placeholder && local?.active).length;
  const waiting = rows.filter(p => p.placeholder && p.uploadPhase === "queued").length;
  const errors = rows.filter(p => p.status === "error" || p.placeholder && ["interrupted","failed"].includes(p.uploadPhase)).length;
  const notUploaded = rows.filter(p => p.placeholder && p.uploadPhase === "not_started").length;
  const reason = active ? "Дождитесь окончания загрузки."
    : doc.activity?.processing ? "Дождитесь окончания обработки."
    : doc.activity?.reviewing ? "Дождитесь завершения проверки заявки." : "";
  return { rows, expected, uploaded, processed, processing, waiting, errors, notUploaded, active, reason,
    updatedAt: local?.active ? local.updatedAt : null,
    visible: Boolean(manifest && (active || rows.some(p => p.placeholder) || local)) || errors>0 || Boolean(doc.activity?.processing) };
}

export function uploadPageLabel(page) {
  if (page.uploadPhase === "interrupted") return "Нет подтверждения от сервера. Проверьте состояние страницы перед повторной загрузкой.";
  return ({ preparing: "Подготавливаем фото…", uploading: "Загружаем фото…", processing: "Обрабатываем фото…",
    failed: "Не удалось загрузить фото. Выберите это фото повторно.",
    queued: "Ожидает загрузки…", not_started: "Не загружено. Загрузка остановлена; выберите это фото повторно." })[page.uploadPhase] || "Обновляем состояние страницы…";
}

export function uploadCountsLabel(view) {
  return [`Страниц: ${view.expected}`, `загружено: ${view.uploaded}`, `обработано: ${view.processed}`,
    view.processing && `в процессе: ${view.processing}`, view.waiting && `ожидают: ${view.waiting}`,
    view.errors && `с ошибкой: ${view.errors}`, view.notUploaded && `не загружено: ${view.notUploaded}`].filter(Boolean).join(" · ");
}
