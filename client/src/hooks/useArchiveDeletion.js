import { useRef, useState } from "react";
import { deletionErrorMessage, getDeletionOutcome } from "../utils/archiveDeletion";

function hintKey(scope) { return `word2you_bulk_delete_hint:${scope}`; }
function wasDismissed(scope) {
  try { return window.sessionStorage.getItem(hintKey(scope)) === "1"; } catch { return false; }
}

export function useArchiveDeletion({ photos, scope, hintScope, onDelete, onDeleteMany }) {
  const [selection, setSelection] = useState({ scope, active: false, names: [] });
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => wasDismissed(hintScope));
  const inFlight = useRef(false);
  const streak = useRef({ scope, times: [] });
  const contextRef = useRef({ scope, hintScope });
  if (selection.scope !== scope) {
    setSelection({ scope, active: false, names: [] });
  }
  if (contextRef.current.scope !== scope || contextRef.current.hintScope !== hintScope) {
    contextRef.current = { scope, hintScope };
    streak.current = { scope, times: [] };
  }
  const available = new Set(photos.filter(photo => !photo.isPendingUpload).map(photo => photo.name));
  const selecting = selection.active && selection.scope === scope;
  const selectedNames = selecting ? selection.names.filter(name => available.has(name)) : [];

  function dismissHint() {
    setHint(false);
    setDismissed(true);
    try { window.sessionStorage.setItem(hintKey(hintScope), "1"); } catch { /* The current view still remembers dismissal. */ }
  }
  function startSelection() {
    if (inFlight.current) return;
    setSelection({ scope, active: true, names: [] });
    setMessage(""); setError(""); setHint(false);
  }
  function cancelSelection() {
    if (inFlight.current) return;
    setSelection({ scope, active: false, names: [] });
    setError("");
  }
  function toggle(name) {
    if (inFlight.current || !available.has(name)) return;
    setSelection({ scope, active: true, names: selectedNames.includes(name)
      ? selectedNames.filter(value => value !== name) : [...selectedNames, name] });
  }
  function selectAll() { if (!inFlight.current) setSelection({ scope, active: true, names: [...available] }); }
  function requestDelete(names, bulk = false) {
    if (inFlight.current) return;
    const snapshot = [...new Set(names)].filter(name => available.has(name));
    if (!snapshot.length) return;
    setError(""); setMessage(""); setDialog({ names: snapshot, bulk, scope });
  }
  function closeDialog() { if (!inFlight.current) setDialog(null); }
  function resetStreak() { streak.current = { scope, times: [] }; setHint(false); }

  async function confirmDelete() {
    if (!dialog || inFlight.current) return;
    inFlight.current = true; setBusy(true); setProgress(0); setError("");
    try {
      let response;
      if (dialog.bulk) {
        response = await onDeleteMany([...dialog.names], count => setProgress(count));
      } else {
        response = await onDelete(dialog.names[0]);
      }
      const outcome = getDeletionOutcome(dialog.names, response);
      setDialog(null);
      const details = [outcome.deleted.length ? `Удалено записей: ${outcome.deleted.length}.` : "",
        outcome.missing.length ? `Уже отсутствуют в архиве: ${outcome.missing.length}.` : "",
        response?.cleanupPending ? "Записи удалены. Удаление исходных файлов будет завершено автоматически." : ""];
      setMessage(details.filter(Boolean).join(" "));
      if (outcome.failed.length) {
        const codes = response?.failed?.map(item => item.code) || [];
        setError(response?.failureCode ? deletionErrorMessage(response.failureCode)
          : codes.includes("DOCUMENT_BUSY")
            ? `Не удалось удалить: ${outcome.failed.length}. ${deletionErrorMessage("DOCUMENT_BUSY")}`
            : `Не удалось удалить: ${outcome.failed.length}. Эти записи остались выбранными — можно повторить.`);
        setSelection({ scope: dialog.scope, active: true, names: outcome.failed });
      } else if (dialog.bulk) {
        setSelection({ scope: dialog.scope, active: false, names: [] });
      }
      if (!dialog.bulk && outcome.deleted.length) {
        const now = Date.now();
        const recent = streak.current.scope === scope ? streak.current.times.filter(time => now - time < 120000) : [];
        streak.current = { scope, times: [...recent, now] };
        if (recent.length >= 2 && !dismissed && available.size - 1 >= 2) setHint(true);
      } else resetStreak();
    } catch (error) {
      setError(deletionErrorMessage(error.response?.data?.error || (error.response ? "PHOTO_DELETE_FAILED" : "DELETE_CONFIRMATION_UNAVAILABLE")));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }
  return { selecting, selectedNames, busy, dialog, progress, message, error,
    showHint: hint && !dismissed && streak.current.scope === scope && streak.current.times.length >= 3 && available.size > 1, total: available.size,
    startSelection, cancelSelection, toggle, selectAll, requestDelete, closeDialog,
    confirmDelete, dismissHint, resetStreak };
}
