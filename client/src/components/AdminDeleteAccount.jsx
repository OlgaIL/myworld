import { useEffect, useRef, useState } from "react";
import { deleteAdminAccount, getAdminAccountDeletion, retryAdminAccountDeletion } from "../services/adminApi";
import "./AdminDeleteAccount.css";

export default function AdminDeleteAccount({ user, onDeleted, deleteAccount = deleteAdminAccount }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmationId, setConfirmationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const dialog = useRef(null);
  const allowed = user.deletion?.allowed && user.deletion?.csrfToken;

  useEffect(() => {
    if (confirming && !dialog.current.open) dialog.current.showModal();
    if (!confirming && dialog.current.open) dialog.current.close();
  }, [confirming]);

  function cancel() {
    if (pending.current) return;
    setConfirming(false);
    setConfirmationId("");
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !allowed || confirmationId !== String(user.id)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await deleteAccount(user.id, confirmationId, user.deletion.csrfToken);
      setConfirming(false);
      onDeleted(user.id, { ...result, csrfToken: user.deletion.csrfToken });
    } catch (failure) {
      setError(failure.response?.data?.message || "Не удалось подтвердить удаление. Обновите карточку перед повтором.");
    } finally { pending.current = false; setBusy(false); }
  }

  return <div className="admin-account-delete">
    <button className="admin-button admin-button--danger" type="button" disabled={!allowed || busy}
      onClick={() => { setError(""); setConfirmationId(""); setConfirming(true); }}>Удалить аккаунт</button>
    {!allowed && <p className="admin-muted">{user.deletion?.message || "Обновите карточку для проверки возможности удаления."}</p>}
    <dialog ref={dialog} className="admin-delete-dialog" aria-labelledby={`delete-account-title-${user.id}`}
      onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <form onSubmit={submit}>
        <h2 id={`delete-account-title-${user.id}`}>Удалить аккаунт?</h2>
        <p><strong>ID: {user.id}</strong><br />{user.displayName || "Без имени"}<br />{user.email || "Без email"}</p>
        <p>Документов в архиве: {user.deletion?.documentsCount ?? user.documentsCount}.</p>
        <p>Аккаунт, его фото, тексты, начисления без оплаты и заявки будут удалены. Связанные гостевые документы тоже будут удалены. Отменить удаление нельзя.</p>
        <p className="admin-muted">Общие файлы других документов сохранятся. Очистка файлов может завершиться позже. В резервных копиях данные могут оставаться до окончания срока их хранения.</p>
        <label className="admin-field"><span>Введите ID {user.id} для подтверждения</span>
          <input autoFocus inputMode="numeric" autoComplete="off" value={confirmationId} disabled={busy}
            onChange={(event) => setConfirmationId(event.target.value)} /></label>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-delete-dialog__actions">
          <button className="admin-button" type="button" onClick={cancel} disabled={busy}>Отмена</button>
          <button className="admin-button admin-button--danger" type="submit" disabled={busy || confirmationId !== String(user.id)}>
            {busy ? "Удаляем…" : "Подтвердить удаление"}</button>
        </div>
      </form>
    </dialog>
  </div>;
}

export function AdminAccountDeletionNotice({ deletion }) {
  const [state, setState] = useState(deletion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!deletion.cleanupPending) return undefined;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const result = await getAdminAccountDeletion(deletion.jobId);
        if (active) { setState(result); setError(""); }
        if (!result.cleanupPending) window.clearInterval(timer);
      }
      catch { if (active) setError("Статус очистки пока недоступен. Файлы останутся в очереди для повторной попытки."); }
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [deletion]);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { setState(await retryAdminAccountDeletion(deletion.jobId, deletion.csrfToken)); }
    catch { setError("Очистка файлов пока не завершена. Повторите позже."); }
    finally { setBusy(false); }
  }

  return <div className="admin-deletion-notice" role="status">
    <p>{state.cleanupPending ? "Аккаунт и данные удалены. Файлы ещё очищаются." : "Аккаунт, его тексты и файлы удалены."}
      {state.preservedFiles > 0 && " Общие файлы других документов сохранены."}</p>
    {state.cleanupPending && <button className="admin-button" type="button" disabled={busy} onClick={retry}>{busy ? "Повторяем…" : "Повторить очистку файлов"}</button>}
    {error && <p className="admin-muted">{error}</p>}
  </div>;
}
