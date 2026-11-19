// Review-only entry, loaded by multipage-preview.html, never by the application.
// All data and mutations below are synthetic; no API or recognition is called.
import { useEffect, useRef, useState } from "react";
import AppHeader from "../components/AppHeader.jsx";
import PageFooter from "../components/PageFooter.jsx";
import DocumentTextVariants from "../components/DocumentTextVariants.jsx";
import PhotoCard from "../components/PhotoCard.jsx";
import Modal from "../components/Modal.jsx";
import ArchiveMergeWarningDialog from "../components/ArchiveMergeWarningDialog.jsx";
import DocumentPageNavigation from "../components/DocumentPageNavigation.jsx";
import MultipageDocument from "../components/MultipageDocument.jsx";
import { getPhotoStatusMeta } from "../constants/documentStatuses.js";
import "../index.css";
import "../components/ArchiveBulkActions.css";
import "../components/MultipageDocument.css";

const user = { displayName: "Учебный профиль", recordLimit: 5, totalRemaining: 3 };
const uploadPreview={pageLimit:25,uploading:true,session:{mode:"group",active:true,items:Array.from({length:4},(_,index)=>({itemId:`preview-${index+1}`,ordinal:index+1,phase:index?"queued":"preparing"}))}};
function image(number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="470"><rect width="360" height="470" fill="white"/><g fill="#344054" font-family="Arial" font-size="13"><text x="30" y="50">ДОГОВОР ОКАЗАНИЯ УСЛУГ</text><text x="30" y="82">Учебная страница ${number}</text></g><g stroke="#98a2b3">${Array.from({ length: 17 }, (_, i) => `<path d="M30 ${116 + i * 16}h${i % 3 === 0 ? 245 : 295}"/>`).join("")}</g><text x="170" y="445" fill="#667085" font-family="Arial">${number}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function page(id, title, body, heading = true, summary = "") {
  const text = heading ? `${title}\n\n${body}` : body;
  return { id, label: title, image: image(id), info: { id: `preview-${id}`, title: "", displayTitle: title, summary,
    status: "processed", cleanText: text, text: text.replace("услуг", "ycлyr"),
    formattedContent: { blocks: [...(heading ? [{ type: "heading", text: title }] : []), { type: "paragraph", text: body }] },
    createdAt: "2026-11-16T10:00:00Z", tags: ["договор"], hasTable: false } };
}
const samplePages = [
  page(1, "1. Предмет договора", "Исполнитель оказывает услуги по подготовке материалов.\nЗаказчик принимает результат в согласованные сроки.", true, "Предмет договора, обязанности исполнителя и заказчика."),
  page(2, "2. Порядок расчётов", "Оплата производится после подписания акта выполненных работ.", true, "Этапы оплаты, суммы и порядок расчётов."),
  page(3, "Подписи сторон", "Заказчик: __________________\n\nИсполнитель: __________________", false, "Реквизиты и подписи заказчика и исполнителя.")
];
samplePages[1].info = { ...samplePages[1].info, hasTable: true, tableStatus: "ready",
  formattedContent: { blocks: [...samplePages[1].info.formattedContent.blocks, { type: "table_source", tableId: "table-1", text: "Этапы оплаты" }] },
  tableContent: { blocks: [{ type: "table", tableId: "table-1", headers: ["Этап", "Сумма, ₽"], rows: [["Подготовка", "5 000"], ["Передача результата", "10 000"]] }] } };
const initialDocuments = () => [
  { id: "contract", title: "Договор оказания услуг", summary: "Условия оказания услуг и порядок расчётов.", pages: structuredClone(samplePages) },
  { id: "act", title: "Акт выполненных работ", summary: "Подтверждение выполнения работ.", pages: [page(4, "Акт выполненных работ", "Работы выполнены в полном объёме. Претензий нет.", true, "Приёмка результата и подтверждение отсутствия претензий.")] },
  { id: "appendix", title: "Приложение к договору", summary: "Перечень работ и сроки.", pages: [page(5, "Приложение к договору", "Срок выполнения работ — 10 рабочих дней.", true, "Перечень работ и согласованные сроки выполнения.")] }
];
const pageCount = n => `${n} ${n % 100 >= 11 && n % 100 <= 14 ? "страниц" : n % 10 === 1 ? "страница" : [2, 3, 4].includes(n % 10) ? "страницы" : "страниц"}`;

function Dialog({ title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => { const previous = document.activeElement; ref.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="confirm-modal" onClick={onClose} onKeyDown={event => {
    if (event.key === "Escape") onClose();
    if (event.key === "Tab") {
      const nodes = Array.from(ref.current.querySelectorAll("button:not(:disabled),input,select,[tabindex='0']"));
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === ref.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }
  }}>
    <section className="confirm-modal__content archive-delete-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
      <h3 className="confirm-modal__title">{title}</h3>{children}<div className="confirm-modal__actions">{footer}</div>
    </section>
  </div>;
}

function OrderRows({ pages, move }) {
  return <ol className="multipage-preview__order">{pages.map((p, i) => <li key={p.id}>
    <img src={p.image} alt="" /><span>Страница {i + 1} · {p.label}</span>
    <div><button className="document-page__back" type="button" disabled={!i} aria-label={`Поднять страницу ${i + 1}`} onClick={() => move(i, -1)}>↑</button>
      <button className="document-page__back" type="button" disabled={i === pages.length - 1} aria-label={`Опустить страницу ${i + 1}`} onClick={() => move(i, 1)}>↓</button></div>
  </li>)}</ol>;
}

function CopyAllButton({ disabled, missing, onClick }) {
  return <button className="multipage-preview__copy-all multipage-preview__layered" disabled={disabled} onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></svg>
    <span>{missing ? "Скопировать доступный текст" : "Скопировать всё"}</span>
  </button>;
}

export default function MultipagePreview() {
  const documentRef = useRef(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [activeId, setActiveId] = useState("contract");
  const [scene, setScene] = useState(()=>new URLSearchParams(window.location.search).get("scene")||"document");
  const [dialog, setDialog] = useState(null);
  const [draft, setDraft] = useState([]);
  const [selected, setSelected] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [variants, setVariants] = useState({});
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("group");
  const [openImage, setOpenImage] = useState(null);
  const active = documents.find(d => d.id === activeId) || documents[0] || { id: null, title: "", summary: "", pages: [] };
  const shownPages = active.pages.map((p, i) => i === 2 && ["error", "no_text", "processing"].includes(scene)
    ? { ...p, info: { ...p.info, status: scene, cleanText: "", text: "" } } : p);
  const ready = shownPages.filter(p => p.info.status === "processed");
  const missing = ready.length !== shownPages.length;
  const processing = shownPages.some(p => p.info.status === "processing");
  const statusMeta = getPhotoStatusMeta(processing ? "processing" : missing ? "recognized" : "processed");
  const tabPages = ready.map(p => ({ page: p, tab: variants[p.id] || "text" }));
  const tablePages = tabPages.filter(p => p.tab === "tables").map(p => shownPages.findIndex(s => s.id === p.page.id) + 1);
  const uploadPages = scene === "balance" ? [...samplePages, page(6, "Фото 4", "Учебный текст"), page(7, "Фото 5", "Учебный текст")] : samplePages;
  const notice = () => setMessage("Это макет: реальные загрузка, обработка и копирование не запускаются.");
  function changeScene(value) {
    if(value==="navigation25") { setDocuments([{...initialDocuments()[0],pages:Array.from({length:25},(_,i)=>page(i+1,`Раздел ${i+1}. Условия договора`,"Стороны согласовывают порядок оказания услуг, сроки выполнения и передачи результата.\n\nИсполнитель передаёт материалы заказчику. Заказчик проверяет результат и направляет замечания в согласованный срок.",true,"Условия, сроки и обязанности сторон."))}]);setActiveId("contract"); }
    if(scene==="navigation25"&&value!=="navigation25") { setDocuments(initialDocuments());setActiveId("contract"); }
    if (["error", "no_text", "processing"].includes(value)) { setDocuments(initialDocuments()); setActiveId("contract"); }
    if (["upload", "balance"].includes(value)) setMode("separate");
    setScene(value); setDialog(null); setMessage(""); setSelected([]); setSelectionMode(false);
  }
  function toggleSelection(id) { setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]); }
  function move(index, shift) { setDraft(prev => { const next = [...prev]; [next[index], next[index + shift]] = [next[index + shift], next[index]]; return next; }); }
  function updatePages(pages) { setDocuments(prev => prev.map(d => d.id === active.id ? { ...d, pages } : d)); }
  function openOrder() { setDraft([...active.pages]); setDialog({ kind: "order" }); }
  function openCopy() {
    const switchedPages = [];
    // Review-only adapter: reuse the real tabs without changing the application component.
    documentRef.current?.querySelectorAll('[data-page-id]').forEach((section, index) => {
      const tabs = Array.from(section.querySelectorAll('[role="tab"]'));
      if (!tabs.some(tab => tab.getAttribute('aria-selected') === 'true' && tab.textContent.startsWith('Таблицы'))) return;
      const formatted = tabs.find(tab => tab.textContent.startsWith('Оформленный') && !tab.disabled);
      if (formatted) { formatted.click(); switchedPages.push(index + 1); }
    });
    setDialog({ kind: "copy", switchedPages });
  }
  function confirmMerge() {
    const sources = selected.map(id => documents.find(d => d.id === id));
    if (sources.some(d => d.pages.length > 1)) { setMessage(""); setDialog({kind:"merge-warning",message:"Пока можно объединять только одностраничные документы. Уберите многостраничные из выбора."}); return; }
    setMessage("");
    setDraft(sources.flatMap(d => d.pages)); setDialog({ kind: "merge", sources });
  }
  function extract(id) {
    const p = active.pages.find(p => p.id === id);
    setDocuments(prev => [...prev.map(d => d.id === active.id ? { ...d, pages: d.pages.filter(p => p.id !== id) } : d),
      { id: `extracted-${id}`, title: p.label, summary: p.info.summary || "", pages: [p] }]);
    setDialog(null); setMessage("Страница убрана из документа и сохранена отдельно в архиве.");
  }
  return <div className="page" data-multipage-preview>
    <AppHeader user={user} recordsUsed={2} recordLimit={5} logoLinkEnabled={false} profileLinkEnabled={false} onLogout={notice} />
    <div className="multipage-preview__review">
      <span>Макет на согласование · учебные данные</span>
      <label>Состояние <select value={scene} onChange={e => changeScene(e.target.value)}>
        <option value="document">Документ</option><option value="processing">Идёт обработка</option><option value="error">Страница с ошибкой</option>
        <option value="no_text">Фото без текста</option><option value="upload">Выбор загрузки</option>
        <option value="balance">Не хватает обработок</option><option value="archive">Архив</option><option value="navigation25">Навигация · 25 страниц</option>
        <option value="pending">Все выбранные страницы · загрузка</option>
      </select></label>
    </div>
    {scene === "pending" ? <MultipageDocument name="upload" user={user} upload={uploadPreview} onBack={()=>changeScene("archive")} reloadPhotos={async()=>{}} reloadUser={async()=>{}}/> : scene === "archive" ? <main className="document-page">
      <div className={`archive-selection-toolbar${selectionMode ? " archive-selection-toolbar--active" : ""}`}>
        <span className="archive-selection-toolbar__count">{selectionMode ? `Выбрано: ${selected.length}` : `Документов в архиве: ${documents.length}`}</span>
        <div className="archive-selection-toolbar__actions">{selectionMode ? <>
          <button className="archive-action" onClick={() => setSelected(documents.map(d => d.id))}>Выбрать всё</button>
          <button className="archive-action" disabled={selected.length < 2} onClick={confirmMerge}>Объединить в один документ</button>
          <button className="archive-action archive-action--danger" disabled={!selected.length} onClick={() => setDialog({ kind: "delete", documents: documents.filter(d => selected.includes(d.id)) })}>Удалить</button>
          <button className="archive-action archive-action--link" onClick={() => { setSelectionMode(false); setSelected([]); setMessage(""); }}>Отмена</button>
        </> : <button className="archive-action" onClick={() => setSelectionMode(true)}>Выбрать</button>}</div></div>
      {message && <p className="archive-delete-message" role="status">{message}</p>}
      <section className="gallery">{documents.map(d => <div key={d.id} className={`archive-selectable ${selectionMode ? "archive-selectable--active" : ""} ${d.pages.length > 1 ? "multipage-preview__stack" : ""} ${selected.includes(d.id) ? "archive-selectable--selected" : ""}`}>
        {selectionMode && <label className="archive-selectable__label"><input type="checkbox" className="archive-selectable__checkbox" aria-label={`Выбрать ${d.title}`} checked={selected.includes(d.id)} onChange={() => toggleSelection(d.id)} /></label>}
        <PhotoCard photo={{ name: d.id, url: d.pages[0].image }} pageCount={d.pages.length} info={{ ...d.pages[0].info, title: d.title, displayTitle: d.title, summary: d.summary }}
          onOpen={selectionMode ? () => toggleSelection(d.id) : notice} onOpenDocument={() => { if (selectionMode) toggleSelection(d.id); else { setActiveId(d.id); changeScene("document"); } }} onRequestDelete={() => setDialog({ kind: "delete", document: d })} />
      </div>)}</section>
    </main> : ["upload", "balance"].includes(scene) ? <main className="document-page">
      <button className="document-page__back" onClick={() => changeScene("archive")}>Назад к списку</button>
      <section className="multipage-preview__upload">
        <h2>Как загрузить фотографии?</h2><p>Выбрано {uploadPages.length} фото. 1 фото — 1 обработка.</p>
        <label><input type="radio" name="upload-mode" checked={mode === "separate"} onChange={() => setMode("separate")} /> Отдельные документы</label>
        <label><input type="radio" name="upload-mode" checked={mode === "group"} onChange={() => setMode("group")} /> Страницы одного документа</label>
        <div className="multipage-preview__thumbs">{uploadPages.map((p,i) => <figure key={p.id}><img src={p.image} alt={`Учебное фото ${i + 1}`} /><figcaption>{i + 1}</figcaption></figure>)}</div>
        <p>{mode === "group" ? `Один документ, ${pageCount(uploadPages.length)}.` : `Отдельных документов: ${uploadPages.length}.`} До 25 страниц в одном документе.</p>
        {scene === "balance" && <p className="document-improvement__error" role="alert">1 фото — 1 обработка. Вы выбрали 5 фото, а доступно 3 обработки. Выберите не больше 3 фото или пополните баланс.</p>}
        <div className="multipage-preview__actions"><button className="document-improvement__button" disabled={scene === "balance"} onClick={notice}>Загрузить</button><button className="document-page__back" onClick={() => changeScene("archive")}>Отмена</button></div>
      </section>
    </main> : <main className="document-page" ref={documentRef}>
      <button className="document-page__back" onClick={() => changeScene("archive")}>Назад к списку</button>
      <div className="document-page__meta multipage-preview__meta"><div className="document-page__meta-details"><p className="gallery__date">16 нояб 2026 г.</p><p className={`gallery__status-badge ${statusMeta.badgeClassName}`}>{missing && !processing ? "Готово частично" : statusMeta.label}</p><span className="multipage-preview__page-count">{pageCount(shownPages.length)}</span></div>
        <div className="document-page__meta-actions"><button className="document-page__back multipage-preview__layered" disabled={processing || shownPages.length >= 25} onClick={() => setDialog({ kind: "append" })}>+ Добавить страницы</button></div></div>
      <section className="document-page__content multipage-preview__heading"><div className="multipage-preview__title-row"><h2>{shownPages[0]?.info.displayTitle||active.title}</h2>
        <CopyAllButton disabled={processing} missing={missing && !processing} onClick={openCopy} />
        </div><p className="document-page__summary">{shownPages[0]?.info.summary??active.summary}</p></section>
      <div className="multipage-preview__actions">
        {shownPages.length > 1 && <button className="document-page__back" disabled={processing} onClick={openOrder}>Изменить порядок страниц</button>}
        {shownPages.length > 1 && <button className="document-page__back" disabled={processing} onClick={() => setDialog({ kind: "split" })}>Разделить на документы</button>}</div>
      <p className="multipage-preview__counts">Загружено: {shownPages.length}, обработано: {ready.length}.{processing ? " Идёт обработка страницы 3 из 3." : missing ? ` Текст есть у ${ready.length} из ${shownPages.length} страниц.` : ""}</p>
      {message && <p className="archive-delete-message" role="status">{message}</p>}
      <div className="document-navigation-layout">
      {shownPages.length>1&&<DocumentPageNavigation pages={shownPages.map(p=>({id:`preview-page-${p.id}`,title:p.label}))}/>}
      <div className="document-navigation-layout__pages">
      {shownPages.map((p,i) => <section className="multipage-preview__page" key={p.id} data-page-id={p.id} id={`preview-page-${p.id}`}>
        <header className="multipage-preview__page-header">{i > 0 && <div className="multipage-preview__page-description"><h3>{p.info.displayTitle || p.label}</h3>
          {p.info.summary && <p className="document-page__summary">{p.info.summary}</p>}</div>}
          <div className="multipage-preview__page-tools"><strong>Страница {i + 1} из {shownPages.length}</strong>
            {shownPages.length > 1 && <button className="archive-action archive-action--link" disabled={processing} onClick={() => setDialog({ kind: "extract", page: p, number: i + 1 })}>Убрать из документа</button>}</div>
        </header>
        <div className="multipage-document__added-status" role="status"><span className={`gallery__status-badge ${getPhotoStatusMeta(p.info.status)?.badgeClassName||""}`}>{getPhotoStatusMeta(p.info.status)?.label}</span></div>
        <div className={`document-page__layout${i===shownPages.length-1?" document-page__layout--side-footer":""}`}><div className="document-page__content">
          {p.info.status === "processing" ? <div className="document-page__text" role="status"><p>Обрабатываем страницу…</p></div> : ["error", "no_text"].includes(p.info.status) ? <div className="document-page__text"><p>{p.info.status === "no_text" ? "На фото не найден текст." : "Не удалось обработать страницу."}</p><p>Обработка не списана.</p>
            <div className="multipage-preview__actions">{p.info.status === "error" && <button className="document-improvement__button" onClick={notice}>Повторить обработку</button>}<button className="document-page__back" onClick={() => setDialog({ kind: "replace", number: i + 1 })}>Заменить фото</button></div></div>
            : <div className="multipage-preview__variant" onClickCapture={event => {
              const tab = event.target.closest('[role="tab"]'); if (!tab) return;
              const name = tab.textContent; const tabId = name.startsWith("Таблицы") ? "tables" : name.startsWith("Оформленный") ? "formatted" : name.startsWith("Исходный") ? "source" : "text";
              setVariants(prev => ({ ...prev, [p.id]: tabId }));
            }}><DocumentTextVariants documentId={`preview-${p.id}`} info={p.info} isAuthenticated authProviders={[]} onCopy={notice} /></div>}
        </div><aside className="document-page__side"><button className="document-page__preview" type="button" onClick={() => setOpenImage(p.image)}><img src={p.image} alt={`Фото страницы ${i + 1}`} /></button>{i===shownPages.length-1&&<div className="document-page__side-footer"><CopyAllButton disabled={processing} missing={missing && !processing} onClick={openCopy}/></div>}</aside>
        </div>
      </section>)}
      </div></div>
      <button className="fab-upload" type="button" disabled={processing || shownPages.length >= 25} title="Добавить страницы" aria-label="Добавить страницы" onClick={() => setDialog({ kind: "append" })}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
      </button>
    </main>}
    {dialog?.kind === "merge-warning" ? <ArchiveMergeWarningDialog message={dialog.message} onClose={()=>setDialog(null)}/> : dialog && <Dialog title={dialog.kind === "copy" ? "Скопировать текст?" : dialog.kind === "order" ? "Изменить порядок страниц" : dialog.kind === "merge" ? "Объединить в один документ?" : dialog.kind === "split" ? "Разделить на отдельные документы?" : dialog.kind === "extract" ? `Убрать страницу ${dialog.number} из документа?` : dialog.kind === "delete" ? "Удалить документ?" : dialog.kind === "replace" ? `Заменить фото страницы ${dialog.number}?` : "Добавить страницы"} onClose={() => setDialog(null)} footer={<>
      <button className="confirm-modal__button confirm-modal__button--secondary" onClick={() => setDialog(null)}>{dialog.kind === "copy" ? "Вернуться к страницам" : "Отмена"}</button>
      {dialog.kind === "append" && <button className="confirm-modal__button confirm-modal__button--secondary" onClick={() => { notice(); setDialog(null); }}>Добавить из архива</button>}
      <button className={`confirm-modal__button${dialog.kind === "delete" ? " confirm-modal__button--danger" : ""}`} onClick={() => {
        if (dialog.kind === "order") updatePages(draft);
        else if (dialog.kind === "extract") { extract(dialog.page.id); return; }
        else if (dialog.kind === "split") { setDocuments(prev => [...prev.filter(d => d.id !== active.id), ...active.pages.map((p,i) => ({ id: i ? `split-${p.id}` : active.id, title: p.label, summary: p.info.summary || "", pages: [p] }))]); setScene("archive"); }
        else if (dialog.kind === "merge") { const first = dialog.sources.find(d => d.pages[0].id === draft[0].id); setDocuments(prev => [...prev.filter(d => !selected.includes(d.id)), { ...first, pages: draft }]); setActiveId(first.id); setSelected([]); setScene("document"); }
        else if (dialog.kind === "delete") { const ids = (dialog.documents || [dialog.document]).map(d => d.id); setDocuments(prev => prev.filter(d => !ids.includes(d.id))); setSelected([]); }
        else notice();
        setDialog(null);
      }}>{dialog.kind === "copy" ? "Скопировать" : dialog.kind === "order" ? "Сохранить порядок" : dialog.kind === "merge" ? "Объединить" : dialog.kind === "split" ? "Разделить" : dialog.kind === "extract" ? "Убрать" : dialog.kind === "delete" ? "Удалить" : "Выбрать фото"}</button>
    </>}>
      {dialog.kind === "copy" ? <><p>Скопируем содержимое всех открытых вкладок в буфер обмена.</p><p>Проверьте открытые вкладки.</p>{dialog.switchedPages.length > 0 && <p>На {dialog.switchedPages.length === 1 ? "странице" : "страницах"} {dialog.switchedPages.join(", ")} вкладка «Таблицы» переключена на «Оформленный», чтобы скопировать текст вместе с таблицами.</p>}{missing && <p>Текст есть у {ready.length} из {shownPages.length} страниц. Скопируем только доступный текст.</p>}{tablePages.length > 0 && <p>На {tablePages.length === 1 ? "странице" : "страницах"} {tablePages.join(", ")} вкладка «Оформленный» недоступна. В копию попадут только таблицы этой страницы.</p>}<p>Между страницами — пустая строка.<br />Служебные названия и номера в копию не войдут.</p></>
        : ["order", "merge"].includes(dialog.kind) ? <>{dialog.kind === "merge" && <p>Название и описание — из первой страницы. Объединение бесплатно; позже документ можно разделить.</p>}<p>Используйте кнопки выше/ниже.</p><OrderRows pages={draft} move={move} /></>
          : dialog.kind === "split" ? <p>Каждая из {active.pages.length} страниц станет отдельным документом.<br />Фото и готовые результаты сохранятся.<br />Обработки не списываются.</p>
            : dialog.kind === "extract" ? <><p>Страница сохранится отдельной записью в архиве.<br />Остальные страницы документа сохранят порядок.</p><p>При перемещении документов в Архив и обратно обработки не списываются.</p></>
              : dialog.kind === "delete" ? <p>{dialog.documents ? `Будет удалено документов: ${dialog.documents.length}, страниц: ${dialog.documents.reduce((sum, d) => sum + d.pages.length, 0)}.` : `Будет удалён весь документ: ${pageCount(dialog.document.pages.length)}.`} Сохраните нужное перед удалением.</p>
                : dialog.kind === "replace" ? <p>Новое фото займёт место страницы {dialog.number}. Остальные страницы сохранят порядок. Новое фото обрабатывается отдельно по действующим правилам.</p>
                  : <p>Новые фотографии добавятся в конец документа.<br />Обработка запускается только для новых фотографий.<br />Максимум — 25 страниц.</p>}
    </Dialog>}
    {openImage && <Modal src={openImage} onClose={() => setOpenImage(null)} />}
    <PageFooter />
  </div>;
}
