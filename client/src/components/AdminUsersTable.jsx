import { Fragment, useState } from "react";
import "./AdminUsersTable.css";
import { DEFAULT_USER_FILTERS, userRemaining, userRowHighlights, userProcessingUsage } from "../utils/adminUsers.js";
const date = value => value ? new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short"
}).format(new Date(value)) : "—";

export default function AdminUsersTable({ users, total, page, pageSize = 25, filters, onFilters,
  loading, error, onRetry, onSelectUser, onShowImprovements, savedUserId, improvementCountsByUser,
  requestCountsByUser = new Map(), webvisorUrl }) {
  const [copyMessage, setCopyMessage] = useState(null);
  function openUser(event, id) {
    if (loading || event.target.closest("a, button:not(.admin-user-directory__open)")) return;
    const row = event.currentTarget;
    const button = row.querySelector(".admin-user-directory__open")
      || row.previousElementSibling?.querySelector(".admin-user-directory__open");
    button?.focus({ preventScroll: true });
    onSelectUser(id);
  }
  async function copyClientId(user) {
    try {
      await navigator.clipboard.writeText(user.metrikaClientId);
      setCopyMessage({ id: user.id, text: "Скопировано" });
    } catch { setCopyMessage({ id: user.id, text: "Не удалось скопировать" }); }
  }
  const change = (name, value) => onFilters({ ...filters, [name]: value, page: 1 });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <section className="admin-users admin-user-directory" aria-labelledby="user-directory-title">
    <div className="admin-user-directory__heading"><h2 id="user-directory-title">Пользователи</h2>
      <span aria-live="polite">Найдено: {total}</span></div>
    <div className="admin-user-directory__filters">
      <label className="admin-field admin-user-directory__search"><span>Поиск</span>
        <input type="search" placeholder="Email, имя или ID" maxLength={160} value={filters.search} onChange={event => change("search", event.target.value)} /></label>
      <label className="admin-field"><span>Покупки</span><select value={filters.payment} onChange={event => change("payment", event.target.value)}>
        <option value="all">Все</option><option value="paid">Есть успешная покупка</option><option value="unpaid">Нет успешных покупок</option>
      </select></label>
      <label className="admin-field"><span>Регистрация</span><select value={filters.registered} onChange={event => change("registered", event.target.value)}>
        <option value="all">За всё время</option><option value="today">Сегодня</option><option value="7d">За 7 дней</option><option value="30d">За 30 дней</option><option value="custom">Диапазон дат</option>
      </select></label>
      {filters.registered === "custom" && <>
        <label className="admin-field"><span>С даты</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={event => change("from", event.target.value)} /></label>
        <label className="admin-field"><span>По дату включительно</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={event => change("to", event.target.value)} /></label>
      </>}
      <label className="admin-field"><span>Обработка документов</span><select value={filters.activity} onChange={event => change("activity", event.target.value)}>
        <option value="all">Все</option><option value="7d">Обрабатывали за 7 дней</option><option value="30d">Обрабатывали за 30 дней</option><option value="never">Ещё не обрабатывали</option>
      </select></label>
      <label className="admin-field"><span>Порядок</span><select value={filters.sort} onChange={event => change("sort", event.target.value)}>
        <option value="newest">Новые первыми</option><option value="lastProcessing">Последняя обработка</option><option value="documents">Число документов</option>
      </select></label>
      <button className="admin-button" type="button" onClick={() => onFilters({ ...DEFAULT_USER_FILTERS })}>Сбросить фильтры</button>
    </div>
    <p className="admin-muted admin-user-directory__note">Даты — Стамбул (UTC+3). Покупки учитывают только успешные платежи, без подарков и ручных начислений.</p>
    <div className="admin-user-directory__legend" aria-label="Подсветка пользователей">
      <span className="admin-user-directory__badge admin-user-directory__badge--today">Регистрация сегодня</span>
      <span className="admin-user-directory__badge admin-user-directory__badge--paid">Есть успешная покупка</span>
    </div>
    {error && <p role="alert" className="admin-error">{error} <button type="button" className="admin-button" onClick={onRetry}>Повторить</button></p>}
    <div aria-busy={loading}>
      {loading && <p role="status">Загружаем пользователей…</p>}
      {!loading && !error && users.length === 0 && <p>Пользователи не найдены. Измените поиск или фильтры.</p>}
      {!error && users.length > 0 &&
        <table className="admin-user-directory__table">
          <thead><tr><th>Пользователь</th><th>Регистрация</th><th>Покупки</th><th>Остаток</th><th>Документы</th><th>Последняя обработка</th></tr></thead>
          <tbody>{users.map(user => {
            const highlight = userRowHighlights(user);
            const rowClass = highlight.paid ? "admin-user-directory__row--paid" : highlight.today ? "admin-user-directory__row--today" : "";
            const acquisition = user.acquisitionContext || {};
            const source = ["yandex-direct", "ya-direct", "yandex_direct"].includes(String(acquisition.utm_source || "").toLowerCase()) ? "Директ" : acquisition.utm_source || "Не определён";
            const visits = user.metrikaVisitsStatus === "ok" && Number.isFinite(Number(user.metrikaVisitsCount)) ? user.metrikaVisitsCount : "—";
            return <Fragment key={user.id}><tr className={rowClass} onClick={event => openUser(event, user.id)}>
            <td data-label="Пользователь"><button className="admin-user-directory__open" type="button" disabled={loading} data-admin-user-id={user.id} aria-label={`Открыть пользователя ${user.id}`}>
              <strong>{user.email || user.displayName || `Пользователь ${user.id}`}</strong>
              <span>ID {user.id}{user.email && user.displayName ? ` · ${user.displayName}` : ""}</span>
            </button>
              {highlight.today && <span className="admin-user-directory__badge admin-user-directory__badge--today">Сегодня</span>}
              {(requestCountsByUser.get(user.id) || 0) > 0 && <span className="admin-user-row__request">Новых заявок: {requestCountsByUser.get(user.id)}</span>}
              {savedUserId === user.id && <span role="status">✓ Сохранено</span>}
              <button type="button" className="admin-user-row__improvement" disabled={loading} onClick={event => { event.stopPropagation(); onShowImprovements(user.id); }}>
                Улучшения: {improvementCountsByUser.get(user.id) || 0}
              </button>
            </td>
            <td data-label="Регистрация">{date(user.createdAt)}</td>
            <td data-label="Покупки">{highlight.paid ? <span className="admin-user-directory__badge admin-user-directory__badge--paid">Есть</span> : "Нет"}</td>
            <td data-label="Остаток">{userRemaining(user)}</td>
            <td data-label="Документы">{user.documentsCount}</td>
            <td data-label="Последняя обработка">{date(user.lastProcessingAt)}</td>
          </tr>
          <tr className={`admin-user-directory__metadata-row ${rowClass}`} onClick={event => openUser(event, user.id)}><td colSpan={6}>
            <div className="admin-user-directory__metadata">
              <div><span>Вход: {user.authProviders?.join(", ") || "—"}</span><span>Визиты: {visits}</span>
                <span>Источник: {source}</span><span>Фраза: {acquisition.utm_term || "—"}</span>
                <span>Устройство: {[user.firstDeviceType, user.firstDeviceOs, user.firstDeviceBrowser].filter(Boolean).join(" · ") || "—"}</span></div>
              <div><span>Лимит: {userProcessingUsage(user)}</span><span>Списано обработок: {Number(user.recordsProcessedTotal || 0)}</span></div>
              <div>Документы: сейчас {Number(user.documentsCount || 0)} · полностью обработано {Number(user.documentsProcessedCount || 0)} · только OCR {Number(user.documentsRecognizedCount || 0)} · ошибки {Number(user.documentsErrorCount || 0)} · без текста {Number(user.documentsNoTextCount || 0)} · в работе {Number(user.documentsPendingCount || 0)} · из гостевого режима {Number(user.documentsTransferredFromGuest || 0)}</div>
              <div>История: создано {Number(user.documentsCreatedTotal || 0)} · удалено {Number(user.documentsDeletedTotal || 0)}{!user.documentsHistoryComplete && " · прежние удаления неизвестны"}</div>
              <div><span>ClientID: {user.metrikaClientId || "—"}</span>
                {user.metrikaClientId && <>
                  <button type="button" className="admin-user-directory__copy" aria-label={`Скопировать ClientID пользователя ${user.id}`} onClick={() => copyClientId(user)}>Копировать</button>
                  <a href={webvisorUrl} target="_blank" rel="noreferrer">Вебвизор</a>
                </>}
                {copyMessage?.id === user.id && <span role="status">{copyMessage.text}</span>}
              </div>
            </div>
          </td></tr></Fragment>;
          })}</tbody>
        </table>}
    </div>
    <nav className="admin-user-directory__pages" aria-label="Страницы пользователей">
      <button type="button" className="admin-button" disabled={loading || page <= 1} onClick={() => onFilters({ ...filters, page: page - 1 })}>Назад</button>
      <span>Страница {page} из {pages} · по {pageSize}</span>
      <button type="button" className="admin-button" disabled={loading || page >= pages} onClick={() => onFilters({ ...filters, page: page + 1 })}>Дальше</button>
    </nav>
  </section>;
}
