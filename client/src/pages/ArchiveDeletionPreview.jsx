import { useState } from "react";
import Gallery from "../components/Gallery";
import DocumentPage from "../components/DocumentPage";
import "./ArchiveDeletionPreview.css";

function demoRecords() {
  const types = ["Квитанция", "Заявление", "Рабочие заметки", "Конспект"];
  return Array.from({ length: 59 }, (_, index) => {
    const title = types[index % types.length];
    const ordinal = Math.floor(index / types.length) + 1;
    const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="140"><rect width="180" height="140" fill="#f3f5f8"/><rect x="28" y="14" width="122" height="112" rx="2" fill="white" stroke="#d7dce5"/><path d="M42 36h80M42 49h94M42 62h76M42 75h90M42 88h60" stroke="#b7c0cf" stroke-width="3"/></svg>`;
    return { name: `demo-record-${index + 1}.png`, status: "processed", title,
      displayTitle: ordinal === 1 ? title : `${title} (${ordinal})`,
      summary: ["Сведения об услугах и начислениях за октябрь.", "Заявление для передачи в управляющую компанию.",
        "Задачи на неделю и итоги рабочей встречи.", "Основные определения и примеры к занятиям."][index % 4],
      cleanText: "Учебный текст для просмотра интерфейса удаления.", tags: [],
      createdAt: "2026-11-02T09:00:00+03:00", url: `data:image/svg+xml,${encodeURIComponent(thumbnail)}` };
  });
}

export default function ArchiveDeletionPreview() {
  const [records, setRecords] = useState(demoRecords);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(6);
  const [generation, setGeneration] = useState(0);
  const [opened, setOpened] = useState(null);
  const [partialFailure, setPartialFailure] = useState(false);
  const [failureSpent, setFailureSpent] = useState(false);
  const matches = records.filter(record => record.displayTitle.toLowerCase().includes(search.trim().toLowerCase()));

  async function removeOne(name) {
    await new Promise(resolve => setTimeout(resolve, 120));
    setRecords(current => current.filter(record => record.name !== name));
    return { deleted: [name] };
  }
  async function removeMany(names, onProgress) {
    const deleted = [], failed = [];
    for (const [index, name] of names.entries()) {
      await new Promise(resolve => setTimeout(resolve, 18));
      if (partialFailure && !failureSpent && index < 2) failed.push(name);
      else deleted.push(name);
      onProgress(index + 1);
    }
    setRecords(current => current.filter(record => !deleted.includes(record.name)));
    setFailureSpent(true);
    return { deleted, failed };
  }
  function reset() {
    setRecords(demoRecords()); setSearch(""); setLimit(6); setOpened(null);
    setGeneration(value => value + 1); setFailureSpent(false); setPartialFailure(false);
  }

  return <div className="page archive-preview">
    <header className="archive-preview__header"><span className="landing-logo">Word2you <span>Записи</span></span><span>Демонстрационный кабинет</span></header>
    <aside className="archive-preview__notice">
      <div><strong>Пример массового удаления</strong><p>Здесь 59 учебных записей. Можно удалять их и начинать заново.</p></div>
      <button className="archive-action" type="button" onClick={reset}>Сбросить пример</button>
    </aside>
    {opened ? <DocumentPage photo={opened} info={opened} isAuthenticated onBack={() => setOpened(null)} onOpenImage={() => {}} onCopy={() => {}} /> :
      <main className="archive-preview__content">
        <div className="archive-preview__heading"><h1>Ваши записи</h1></div>
        <Gallery key={generation} photos={matches.slice(0, limit)} selectionPhotos={matches}
          selectionScopeKey={search.trim().toLowerCase()} bulkHintScope={`preview-${generation}`}
          isFiltered={Boolean(search.trim())} archiveTotal={records.length} onOpen={() => {}} onOpenDocument={photo => setOpened(records.find(record => record.name === photo.name))}
          onDelete={removeOne} onDeleteMany={removeMany} emptyMessage={records.length ? "Ничего не найдено." : "Все записи удалены. Сбросьте пример, чтобы попробовать ещё раз."}>
          <label className="archive-preview__search"><span>Поиск по записям</span><input type="search" placeholder="Например, квитанция" value={search}
            onChange={event => { setSearch(event.target.value); setLimit(6); }} /></label>
        </Gallery>
        {matches.length > limit && <div className="cabinet-gallery-more">
          <button className="archive-action" type="button" onClick={() => setLimit(value => value + 6)}>Показать ещё {Math.min(6, matches.length - limit)}</button>
          <span className="cabinet-gallery-more__count">Осталось: {matches.length - limit}</span>
        </div>}
        <details className="archive-preview__scenarios"><summary>Дополнительный сценарий для просмотра</summary>
          <label><input type="checkbox" checked={partialFailure} onChange={event => { setPartialFailure(event.target.checked); setFailureSpent(false); }} />
            Показать, как выглядит результат, если две записи не удалось удалить</label>
        </details>
      </main>}
  </div>;
}
