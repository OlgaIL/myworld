import { useEffect, useRef, useState } from "react";
import { createAdminGift } from "../services/adminApi";
import "./AdminGiftProcessing.css";

export default function AdminGiftProcessing({ user, disabled, onGifted, onDirtyChange, onBusyChange }) {
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const request = useRef(null);
  const dirty = Boolean(note) || amount !== "10";
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  const valid = Number.isInteger(Number(amount)) && Number(amount) >= 1 && Number(amount) <= 10000 && note.trim();

  async function submit(event) {
    event.preventDefault();
    if (pending.current || disabled || !valid || !user.deletion?.csrfToken) return;
    const values = { amount: Number(amount), note: note.trim() };
    const signature = JSON.stringify(values);
    if (request.current?.signature !== signature) request.current = { signature, ...values, requestId: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await createAdminGift(user.id, {
        amount: request.current.amount, note: request.current.note, requestId: request.current.requestId
      }, user.deletion.csrfToken);
      onGifted(result.user);
      request.current = null;
      setAmount("10");
      setNote("");
      setMessage(`Подарено обработок: ${values.amount}.`);
    } catch (failure) {
      const code = failure.response?.data?.error;
      setError(code === "INVALID_GIFT" ? "Укажите целое число от 1 до 10 000 и причину до 500 символов."
        : code === "GIFT_CSRF" ? "Обновите карточку пользователя и повторите."
          : code === "GIFT_REQUEST_CONFLICT" ? "Этот запрос уже использован. Обновите карточку."
            : "Ответ о начислении не получен. Повторите с теми же данными — подарок не задвоится.");
    } finally { pending.current = false; setBusy(false); }
  }

  return <section className="admin-gift-processing" aria-labelledby={`gift-title-${user.id}`}>
    <div className="admin-gift-processing__form-panel">
    <h3 id={`gift-title-${user.id}`}>Подарить обработки</h3>
    <p className="admin-muted admin-gift-processing__description">Бесплатный остаток увеличится на указанное число.<br />Подарок расходуется перед пакетами.</p>
    <form onSubmit={submit}>
      <fieldset disabled={disabled || busy} className="admin-gift-processing__fields">
        <label className="admin-field"><span>Количество обработок</span>
          <input type="number" min="1" max="10000" step="1" required value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label className="admin-field"><span>Причина подарка</span>
          <textarea rows={4} required maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
        <button className="admin-button admin-button--primary" type="submit" disabled={!valid || !user.deletion?.csrfToken}>
          {busy ? "Начисляем…" : "Подарить"}</button>
      </fieldset>
      {disabled && <p className="admin-muted">Сначала сохраните или отмените изменения доступа.</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </form>
    </div>
    <section className="admin-gift-processing__history" aria-labelledby={`gift-history-title-${user.id}`}>
    <h3 id={`gift-history-title-${user.id}`}>История подарков</h3>
    {user.gifts?.length ? <ol>{user.gifts.map(gift => <li key={gift.id}>
      <strong>+{gift.amount}</strong> · {new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }).format(new Date(gift.created_at))}
      <p>{gift.note}</p>
    </li>)}</ol> : <p className="admin-muted">Подарков пока нет.</p>}
    </section>
  </section>;
}
