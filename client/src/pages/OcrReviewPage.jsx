import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DocumentTextVariants from "../components/DocumentTextVariants";
import Modal from "../components/Modal";
import { getOcrReviewCases, getOcrReviewImageUrl, processOcrReviewCase, restoreOcrReviewTables } from "../services/adminApi";
import "./OcrReviewPage.css";

const profiles = { guest: "Гость", free: "Бесплатный доступ", paid: "Платный доступ" };
const statuses = { processed: "Готово", recognized: "Только OCR", no_text: "Нет текста", error: "Ошибка" };

function ReviewCard({ row, token, busy, onRetry, onPreview }) {
  const [copiedMap, setCopiedMap] = useState({});
  const tableApi = useMemo(() => ({
    get: async () => row.result.info,
    restore: () => restoreOcrReviewTables(row.id, { token, runId: row.runId })
  }), [row.id, row.result, row.runId, token]);
  async function onCopy(key, text, options) {
    if (options?.html && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([options.html], { type: "text/html" }) })]);
    } else await navigator.clipboard.writeText(text);
    setCopiedMap({ [key]: true });
  }
  const info = row.result?.info;
  return <article className="ocr-review__case" aria-label={row.name}>
    <header><h2>{row.name}</h2><span aria-live="polite">{row.state === "processing" ? "Обрабатывается…" : row.state === "queued" ? "В очереди" : row.error ? "Ошибка" : statuses[info?.status] || "Готово"}</span>
      <button type="button" disabled={busy} onClick={() => onRetry(row.id)}>Повторить</button></header>
    <div className="ocr-review__case-body">
      <button className="ocr-review__image" onClick={() => onPreview(getOcrReviewImageUrl(row.id))} aria-label={`Увеличить ${row.name}`}>
        <img src={getOcrReviewImageUrl(row.id)} alt={`Контрольное ${row.name.toLowerCase()}`} loading="lazy" />
      </button>
      <div className="ocr-review__result">
        {row.result?.pipeline && <p className="ocr-review__meta">{row.result.pipeline.ocrProvider} → {row.result.pipeline.aiProvider} · {(row.result.durationMs / 1000).toFixed(1)} с</p>}
        {row.error && <p role="alert">{row.error}</p>}
        {info?.error && <p role="alert">{info.error}</p>}
        {info && <DocumentTextVariants documentId={`${row.id}-${row.runId}`} info={info} copiedMap={copiedMap}
          onCopy={onCopy} isAuthenticated packageRemaining={1} tableTrialAvailable tableApi={tableApi} enrichmentPending={info.status === "recognized"} />}
      </div>
    </div>
  </article>;
}

export default function OcrReviewPage() {
  const [config, setConfig] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [audience, setAudience] = useState("free");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const stop = useRef(false);
  const mounted = useRef(false);
  const active = useRef(false);
  const autoStarted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    getOcrReviewCases().then((data) => {
      if (!cancelled) { setConfig(data); setRows(data.cases.map((item) => ({ ...item, state: "queued" }))); }
    }).catch((err) => {
      if (!cancelled) setError(err.response?.status === 401 ? "Войдите в админку, чтобы открыть проверку."
        : "Контрольный набор недоступен. Проверьте настройку набора на сервере.");
    });
    return () => { cancelled = true; mounted.current = false; stop.current = true; };
  }, []);

  const run = useCallback(async (cases, selectedAudience, settings) => {
    if (active.current) return;
    active.current = true;
    stop.current = false;
    setBusy(true);
    const runId = crypto.randomUUID();
    const selected = new Set(cases.map((item) => item.id));
    setRows((previous) => previous.map((row) => selected.has(row.id) ? { ...row, state: "queued", result: null, error: "", runId } : row));
    for (const item of cases) {
      if (stop.current || !mounted.current) break;
      setRows((previous) => previous.map((row) => row.id === item.id ? { ...row, state: "processing", result: null, error: "", runId } : row));
      try {
        const result = await processOcrReviewCase(item.id, { token: settings.token, runId, audience: selectedAudience });
        if (mounted.current) setRows((previous) => previous.map((row) => row.id === item.id ? { ...row, state: "done", result } : row));
      } catch (err) {
        if (mounted.current) setRows((previous) => previous.map((row) => row.id === item.id ? { ...row, state: "done", error: err.response?.status === 409
          ? "Другой пример ещё обрабатывается. Повторите этот пример позже." : "Не удалось обработать пример. Повторите позже." } : row));
      }
    }
    active.current = false;
    if (mounted.current) setBusy(false);
  }, []);

  useEffect(() => {
    if (!config || autoStarted.current) return;
    autoStarted.current = true;
    void run(config.cases, "free", config);
  }, [config, run]);

  return <main className="ocr-review">
    <Link to="/admin-control">← В админку</Link>
    <h1>Проверка контрольных фотографий</h1>
    <p>Фотографии обрабатываются по очереди при открытии страницы. Здесь используются обработка и просмотр результата с сайта. Запросы расходуют API; пользовательские лимиты не списываются.</p>
    {error && <p role="alert">{error}</p>}
    {config && <div className="ocr-review__controls">
      <label>Режим пользователя <select value={audience} disabled={busy} onChange={(event) => setAudience(event.target.value)}>
        {Object.entries(profiles).map(([key, label]) => <option key={key} value={key}>{label} · {config.profiles[key].ocrProvider} → {config.profiles[key].aiProvider}</option>)}
      </select></label>
      <button disabled={busy} onClick={() => run(config.cases, audience, config)}>Повторить весь набор</button>
      <button disabled={!busy} onClick={() => { stop.current = true; }}>Остановить после текущего фото</button>
      <span role="status">Готово {rows.filter((row) => row.state === "done").length} из {rows.length}</span>
    </div>}
    {rows.map((row) => <ReviewCard key={`${row.id}-${row.runId || "queued"}`} row={row} token={config.token} busy={busy}
      onRetry={(id) => run(config.cases.filter((item) => item.id === id), audience, config)} onPreview={setPreview} />)}
    {preview && <Modal src={preview} onClose={() => setPreview("")} />}
  </main>;
}
