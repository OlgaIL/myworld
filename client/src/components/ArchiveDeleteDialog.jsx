import { useEffect, useId, useRef } from "react";
import { recordCountLabel } from "../utils/archiveDeletion";

export default function ArchiveDeleteDialog({ names, busy, progress, error, onCancel, onConfirm }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
      else document.querySelector('[aria-label="Управление записями"] button')?.focus();
    };
  }, []);
  useEffect(() => { if (busy) dialogRef.current?.focus(); }, [busy]);

  function handleKeyDown(event) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); }
    if (event.key !== "Tab") return;
    const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
    if (!buttons.length) { event.preventDefault(); return; }
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="confirm-modal" onClick={() => !busy && onCancel()}>
    <section className="confirm-modal__content archive-delete-dialog" role="dialog" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy}
      ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown} onClick={event => event.stopPropagation()}>
      <h3 className="confirm-modal__title" id={titleId}>Удалить {recordCountLabel(names.length)}?</h3>
      <div id={descriptionId} className="archive-delete-dialog__description">
        <p>Будут удалены исходные фотографии и распознанные результаты. Сохраните нужное перед удалением.</p>
        <p>Аккаунт, покупки и остаток обработок сохранятся. Удаление не возвращает потраченные обработки.</p>
        <p className="archive-delete-dialog__irreversible">Это действие нельзя отменить.</p>
      </div>
      {error && <p className="archive-delete-error" role="alert">{error}</p>}
      {busy && <p role="status">Удаляем: {progress} из {names.length}…</p>}
      <div className="confirm-modal__actions">
        <button type="button" className="confirm-modal__button confirm-modal__button--secondary" ref={cancelRef}
          onClick={onCancel} disabled={busy}>Отмена</button>
        <button type="button" className="confirm-modal__button confirm-modal__button--danger"
          onClick={onConfirm} disabled={busy}>{busy ? "Удаляем…" : `Удалить ${recordCountLabel(names.length)}`}</button>
      </div>
    </section>
  </div>;
}
