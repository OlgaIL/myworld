import { useEffect, useState } from "react";
import { getAdminGuestStorage } from "../services/adminApi";
import { createLatestLoader } from "../utils/latestLoader";
import "./AdminGuestStorage.css";

const date = (value) => value ? new Date(value).toLocaleString("ru-RU") : "—";
const states = { running: "Выполняется", success: "Успешно", errors: "Завершено с ошибками", busy: "Пропущено из-за блокировки", interrupted: "Вероятно прервано" };
const warnings = { schedule_unconfigured: "Часовой пояс очистки ещё не задан.", schedule_invalid: "Часовой пояс очистки задан неверно.", waiting_first_run: "Ожидается первый ежедневный запуск.", missed_schedule: "Ожидаемый запуск пропущен (допуск — 1 час)." };

function Run({ run, label }) {
  if (!run) return <p>{label}: данных ещё нет.</p>;
  const c = run.counters;
  return <div className="admin-guest-storage__run">
    <p><strong>{label}: {states[run.state] || run.state}</strong></p>
    <p>Начало: {date(run.started_at)} · Окончание: {date(run.finished_at)}</p>
    <p>Кандидаты: {c.candidates ?? "—"} · Документы: {c.deleted ?? "—"} · Файлы: {c.filesRemoved ?? "—"} · Уже отсутствовали: {c.filesMissing ?? "—"} · Заняты: {c.busy ?? "—"} · Ошибки: {c.errors ?? "—"} · Требуют ручного разбора: {c.legacy ?? "—"}</p>
    {run.incomplete && <p role="status">Учёт неполный: результат части файловых операций после прерывания неизвестен.</p>}
  </div>;
}

export function GuestStorageContent({ data, error }) {
  if (error) return <p className="admin-error" role="alert">Статистика гостей временно недоступна. Проверьте БД и миграцию 037.</p>;
  if (!data) return <p className="admin-muted" role="status">Загрузка...</p>;
  const p = data.period;
  return <>
    <p className="admin-muted">Статистика собирается с {date(data.collectedAt)}. Обновлено: {date(data.generatedAt)}.</p>
    {new Date(data.periodStart) < new Date(data.collectedAt) && <p className="admin-muted">За часть периода до начала сбора история неизвестна; показаны только собранные события.</p>}
    <div className="admin-llm-summary__metrics admin-guest-storage__metrics">
      <span>Загрузки <strong>{p.uploads}</strong></span>
      <span>Успешно <strong>{p.processed}</strong></span>
      <span>Только распознано <strong>{p.recognized}</strong></span>
      <span>Без текста <strong>{p.no_text}</strong></span>
      <span>Ошибки <strong>{p.error}</strong></span>
      <span>Удалено документов <strong>{p.documentsDeleted}</strong></span>
      <span>Удалено файлов <strong>{p.filesRemoved}</strong></span>
    </div>
    <div className="admin-llm-summary__metrics admin-guest-storage__metrics">
      <span>Сейчас хранится <strong>{data.current.stored}</strong></span>
      <span>Ожидают удаления <strong>{data.current.expired}</strong></span>
    </div>
    <p className="admin-muted">Период: {date(data.periodStart)} — {date(data.periodEnd)}. Загрузки и исходы учитываются по времени события; они могут не совпадать. Хранение сейчас не зависит от периода.</p>
    <p>Файлы включают все подтверждённые удаления гостевой очистки: по сроку хранения {p.categories.ttl?.removed || 0}, исходники после переноса/замены {p.categories.source?.removed || 0}, временные файлы {p.categories.artifact?.removed || 0}. Уже отсутствовали: {p.filesMissing}.</p>
    {p.incompleteFiles > 0 && <p role="status">Учёт файлов неполный: {p.incompleteFiles} операций с неизвестным или неполным результатом. Подтверждённые удаления — нижняя граница.</p>}
    <p>Ежедневно в 05:00 · часовой пояс: {data.schedule.timezone || "не задан"}.
      {data.schedule.source === "local_backend"
        ? " Локально: при работающем backend; пропущенная очистка выполняется при запуске."
        : " Запуск через cron; настройка не подтверждает его работу."}</p>
    {data.schedule.warning && <p role="status">{warnings[data.schedule.warning]}</p>}
    <Run run={data.latest} label="Последняя очистка" />
    {data.latest?.state !== "success" && <Run run={data.lastSuccess} label="Последняя успешная очистка" />}
  </>;
}

export default function AdminGuestStorage({ hours }) {
  const [state, setState] = useState({ hours: null, data: null, error: false });
  useEffect(() => {
    const loader = createLatestLoader(() => getAdminGuestStorage(hours),
      (data) => setState({ hours, data, error: false }),
      () => setState({ hours, data: null, error: true }));
    loader.refresh();
    const timer = window.setInterval(loader.refresh, 60000);
    return () => { loader.dispose(); window.clearInterval(timer); };
  }, [hours]);
  return <div className="admin-guest-storage" role="region" aria-label="Гости и очистка">
    <h3 className="admin-llm-summary__subtitle">Гости и очистка</h3>
    <GuestStorageContent data={state.hours === hours ? state.data : null} error={state.hours === hours && state.error} />
  </div>;
}
