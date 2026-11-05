import { useEffect, useMemo, useState } from "react";
import PhotoCard from "./PhotoCard";
import { getPhotoInfo } from "../services/api";
import { useArchiveDeletion } from "../hooks/useArchiveDeletion";
import ArchiveDeleteDialog from "./ArchiveDeleteDialog";
import "./ArchiveBulkActions.css";

function getPhotoListInfo(photo) {
  if (!photo?.status) {
    return null;
  }

  return {
    status: photo.status,
    title: photo.title || "",
    displayTitle: photo.displayTitle || photo.title || "Запись",
    summary: photo.summary || "",
    category: photo.category || "",
    section: photo.section || "",
    topic: photo.topic || "",
    text: photo.text || "",
    cleanText: photo.cleanText || "",
    tags: Array.isArray(photo.tags) ? photo.tags : [],
    textQuality: photo.textQuality || "",
    notes: photo.notes || "",
    formattedContent: photo.formattedContent || null,
    formattedAt: photo.formattedAt || null,
    hasTable: Boolean(photo.hasTable),
    hasFormulas: Boolean(photo.hasFormulas),
    hasRecognitionErrors: Boolean(photo.hasRecognitionErrors),
    error: photo.error || null,
    createdAt: photo.createdAt || null
  };
}

function Gallery({ photos, pendingPhoto, pendingPhotos = [], improvementRequestsByDocumentId = {}, onOpen, onOpenDocument, onDelete, uploadMessage = "", emptyMessage = "Пока тут пусто. Загрузите ваши фото.", onSelectCategory, onSelectTag,
  onDeleteMany, selectionPhotos = photos, selectionScopeKey = "all", bulkHintScope = "archive", isFiltered = false, archiveTotal = selectionPhotos.length, children }) {
  const [infoMap, setInfoMap] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const bulkEnabled = typeof onDeleteMany === "function";
  const pendingQueue = useMemo(
    () => (pendingPhotos.length > 0 ? pendingPhotos : (pendingPhoto ? [pendingPhoto] : [])),
    [pendingPhoto, pendingPhotos]
  );
  const visiblePhotos = useMemo(() => {
    const pendingServerNames = new Set(pendingQueue.map((photo) => photo.serverName).filter(Boolean));
    return photos.filter((photo) => !pendingServerNames.has(photo.name));
  }, [pendingQueue, photos]);
  const selectablePhotos = useMemo(() => {
    const pendingNames = new Set(pendingQueue.map(photo => photo.serverName).filter(Boolean));
    return selectionPhotos.filter(photo => !pendingNames.has(photo.name));
  }, [pendingQueue, selectionPhotos]);
  const bulk = useArchiveDeletion({ photos: selectablePhotos, scope: selectionScopeKey, hintScope: bulkHintScope, onDelete, onDeleteMany });

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    async function hydratePhotoInfo() {
      const photosToRefresh = visiblePhotos.filter((photo) => {
        const info = infoMap[photo.name] || getPhotoListInfo(photo);

        if (!info) {
          return true;
        }

        return info.status === "uploaded" || info.status === "processing";
      });

      if (photosToRefresh.length === 0) {
        return;
      }

      for (const photo of photosToRefresh) {
        try {
          const info = await getPhotoInfo(photo.name);

          if (cancelled) {
            return;
          }

          setInfoMap((prev) => ({
            ...prev,
            [photo.name]: {
              status: info.status,
              title: info.title || "",
              displayTitle: info.displayTitle || info.title || "Запись",
              summary: info.summary || "",
              category: info.category || "",
              section: info.section || "",
              topic: info.topic || "",
              text: info.text || "",
              cleanText: info.cleanText || "",
              tags: Array.isArray(info.tags) ? info.tags : [],
              textQuality: info.textQuality || "",
              notes: info.notes || "",
              formattedContent: info.formattedContent || null,
              formattedAt: info.formattedAt || null,
              hasTable: Boolean(info.hasTable),
              hasFormulas: Boolean(info.hasFormulas),
              hasRecognitionErrors: Boolean(info.hasRecognitionErrors),
              error: info.error || null,
              createdAt: info.createdAt || null
            }
          }));
        } catch (error) {
          if (cancelled) {
            return;
          }

          setInfoMap((prev) => ({
            ...prev,
            [photo.name]: {
              status: "error",
              error: error.message
            }
          }));
        }
      }
    }

    timeoutId = setTimeout(hydratePhotoInfo, 800);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [visiblePhotos, infoMap]);

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    await onDelete(pendingDelete);
    setPendingDelete(null);
  }

  if (visiblePhotos.length === 0 && pendingQueue.length === 0 && !bulkEnabled && !children) {
    return <>{bulkEnabled && bulk.message && <p className="archive-delete-message" role="status">{bulk.message}</p>}<p className="gallery__empty">{emptyMessage}</p></>;
  }

  return (
    <>
      {bulkEnabled && <>
        {bulk.showHint && <aside className="archive-delete-hint" role="status">
          <div><strong>Удаляете несколько записей?</strong><p>Их можно выбрать и удалить вместе.</p></div>
          <div className="archive-selection-toolbar__actions">
            <button className="archive-action" type="button" onClick={bulk.startSelection}>Выбрать записи</button>
            <button className="archive-action" type="button" onClick={bulk.dismissHint}>Не сейчас</button>
          </div>
        </aside>}
        {archiveTotal > 0 && <div className={`archive-selection-toolbar ${bulk.selecting ? "archive-selection-toolbar--active" : ""}`} aria-label="Управление записями">
          <span className="archive-selection-toolbar__count">Документов в архиве: {archiveTotal}</span>
          {bulk.selecting ? <button className="archive-action archive-action--link" type="button" onClick={bulk.selectAll} disabled={bulk.busy || bulk.selectedNames.length === bulk.total}>
            {isFiltered ? `Выбрать все найденные: ${bulk.total}` : `Выбрать все ${bulk.total}`}</button>
            : <button className="archive-action archive-action--link" type="button" onClick={bulk.startSelection} disabled={!bulk.total}>Выбрать</button>}
          <div className="archive-selection-toolbar__actions">
            {bulk.selecting ? <>
              <span className="archive-selection-toolbar__count">Выбрано: {bulk.selectedNames.length}</span>
              <button className="archive-action archive-action--danger" type="button" onClick={() => bulk.requestDelete(bulk.selectedNames, true)} disabled={bulk.busy || !bulk.selectedNames.length}>
                Удалить выбранное{bulk.selectedNames.length ? ` (${bulk.selectedNames.length})` : ""}</button>
              <button className="archive-action archive-action--link" type="button" onClick={bulk.cancelSelection} disabled={bulk.busy}>Отмена</button>
            </> : null}
          </div>
        </div>}
        {bulk.message && <p className="archive-delete-message" role="status">{bulk.message}</p>}
        {bulk.error && !bulk.dialog && <p className="archive-delete-error" role="alert">{bulk.error}</p>}
      </>}
      {children}
      <section className="gallery">
        {visiblePhotos.length === 0 && pendingQueue.length === 0 && emptyMessage && <p className="gallery__empty">{emptyMessage}</p>}
        {pendingQueue.map((photo) => (
          <PhotoCard
            key={photo.name}
            photo={photo}
            info={null}
            uploadMessage={photo.uploadMessage || uploadMessage}
            onOpen={onOpen}
            onOpenDocument={onOpenDocument}
            onRequestDelete={setPendingDelete}
            onSelectCategory={onSelectCategory}
            onSelectTag={onSelectTag}
          />
        ))}

        {visiblePhotos.map((photo) => {
          const info = infoMap[photo.name] || getPhotoListInfo(photo);
          const card = (
          <PhotoCard
            key={photo.name}
            photo={photo}
            info={info}
            onOpen={onOpen}
            onOpenDocument={bulkEnabled ? (...args) => { bulk.resetStreak(); onOpenDocument(...args); } : onOpenDocument}
            onRequestDelete={bulkEnabled ? name => bulk.requestDelete([name]) : setPendingDelete}
            onSelectCategory={onSelectCategory}
            onSelectTag={onSelectTag}
            improvementRequest={improvementRequestsByDocumentId[photo.name] || null}
          />
          );
          if (!bulkEnabled) return card;
          return <div key={photo.name} className={`archive-selectable ${bulkEnabled && bulk.selecting ? "archive-selectable--active" : ""} ${bulkEnabled && bulk.selectedNames.includes(photo.name) ? "archive-selectable--selected" : ""}`}>
            {bulk.selecting && <button type="button" className="archive-selectable__surface" tabIndex={-1} aria-hidden="true"
              onClick={() => bulk.toggle(photo.name)} disabled={bulk.busy} />}
            {bulkEnabled && bulk.selecting && <label className="archive-selectable__label">
              <input className="archive-selectable__checkbox" type="checkbox" checked={bulk.selectedNames.includes(photo.name)}
                onChange={() => bulk.toggle(photo.name)} disabled={bulk.busy}
                aria-label={`Выбрать «${info?.displayTitle || info?.title || "Запись"}»`} />
            </label>}
            <div inert={bulkEnabled && (bulk.selecting || bulk.busy) ? true : undefined}>{card}</div>
          </div>;
        })}
      </section>

      {bulkEnabled && bulk.dialog && <ArchiveDeleteDialog names={bulk.dialog.names} busy={bulk.busy}
        progress={bulk.progress} error={bulk.error} onCancel={bulk.closeDialog} onConfirm={bulk.confirmDelete} />}

      {pendingDelete && (
        <div className="confirm-modal" onClick={() => setPendingDelete(null)}>
          <div className="confirm-modal__content" onClick={(event) => event.stopPropagation()}>
            <h3 className="confirm-modal__title">Удалить фото?</h3>
            <p className="confirm-modal__text">Это действие нельзя отменить.</p>
            <div className="confirm-modal__actions">
              <button
                type="button"
                className="confirm-modal__button confirm-modal__button--secondary"
                onClick={() => setPendingDelete(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="confirm-modal__button confirm-modal__button--danger"
                onClick={confirmDelete}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Gallery;
