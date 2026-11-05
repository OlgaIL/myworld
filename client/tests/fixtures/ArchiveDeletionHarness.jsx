// Browser QA of the actual App/usePhotos/useCabinetFilters/CabinetHome. All API
// calls are handled in memory; this harness cannot delete a real document.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import axios from "axios";
import { AuthProvider } from "../../src/contexts/AuthContext";
import App from "../../src/pages/App";
import "../../src/index.css";

if (!import.meta.env.DEV) throw Error("DEV_ONLY_HARNESS");
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240"><rect width="180" height="240" fill="#eef2f7"/><text x="20" y="90" fill="#475467">Учебное фото</text></svg>')}`;
const makePhoto = i => ({ name: `synthetic-${i}.jpg`, title: i % 2 ? "Заявление" : "Квитанция",
  displayTitle: `${i % 2 ? "Заявление" : "Квитанция"} (${i + 1})`, status: "processed", summary: "Учебная запись",
  section: "Учебные записи", topic: "Проверка удаления", tags: [], cleanText: `Учебный текст ${i}`,
  createdAt: "2026-11-03T09:00:00Z", url: image });
let records = Array.from({ length: 159 }, (_, i) => makePhoto(i));
let mode = "success", batches = [], subscribers = [], secondErrorSpent = false, addLater = false;
const user = { id: "synthetic-bulk-qa", displayName: "Учебный кабинет", packageRemaining: 172,
  packageQuota: 200, paidRemaining: 172, freeRemaining: 0, totalRemaining: 172,
  recordsProcessedTotal: 159, recordLimit: 500, recordUploadAllowed: true, processingAllowed: true,
  legalAccepted: true, legalAgreementAccepted: true };
const notify = () => subscribers.forEach(fn => fn(value => value + 1));
axios.defaults.adapter = async config => {
  const route = new URL(config.url, location.origin).pathname;
  const method = config.method;
  const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  let result;
  if (route === "/api/me") result = { ...user, recordsUsed: records.length };
  else if (route === "/api/photos-metadata") result = records.map(photo => ({ ...photo }));
  else if (route === "/api/auth-providers" || route === "/api/improvement-requests") result = [];
  else if (route === "/api/photos/delete-batch" && method === "post") {
    batches.push([...data.names]);
    if (mode === "busy") {
      notify();
      throw new axios.AxiosError("Synthetic busy", "ERR_BAD_REQUEST", config, null, { status: 409, data: { error: "ACCOUNT_BUSY" } });
    }
    const failed = mode === "partial" ? data.names.slice(0, 2) : [];
    const deleted = data.names.filter(name => !failed.includes(name) && records.some(record => record.name === name));
    records = records.filter(record => !deleted.includes(record.name));
    result = { deleted, missing: data.names.filter(name => !deleted.includes(name) && !failed.includes(name)),
      failed: failed.map(name => ({ name, code: "DOCUMENT_BUSY" })), cleanupPending: false };
    mode = mode === "partial" ? "success" : mode;
    notify();
    if (mode === "lost-second-ack" && batches.length === 2 && !secondErrorSpent) {
      secondErrorSpent = true;
      throw new axios.AxiosError("Synthetic lost acknowledgement", "ERR_NETWORK", config);
    }
  } else if (route.startsWith("/api/photos/") && method === "delete") {
    const name = decodeURIComponent(route.split("/").at(-1));
    records = records.filter(record => record.name !== name);
    result = { deleted: [name], missing: [], failed: [], cleanupPending: false };
    notify();
  } else result = {};
  return { data: result, status: 200, statusText: "OK", headers: {}, config };
};

new MutationObserver(() => {
  if (addLater && document.querySelector('[role="dialog"]')) {
    addLater = false; records.push({ ...makePhoto(999), title: "Новая загрузка", displayTitle: "Новая загрузка" }); notify();
  }
}).observe(document.documentElement, { childList: true, subtree: true });

export default function Harness() {
  const [, render] = useState(0);
  const [generation, setGeneration] = useState(0);
  if (!subscribers.includes(render)) subscribers.push(render);
  function reset() {
    records = Array.from({ length: 159 }, (_, i) => makePhoto(i));
    mode = "success"; batches = []; secondErrorSpent = false; addLater = false;
    sessionStorage.removeItem(`word2you_bulk_delete_hint:account-${user.id}`);
    setGeneration(value => value + 1);
  }
  return <>
    <aside style={{ padding: 12, background: "#fff8e7" }}>
      <strong>QA: учебный кабинет — настоящий API не вызывается.</strong>{" "}
      <button onClick={reset}>Сбросить QA</button>{" "}
      <select aria-label="Сценарий QA" value={mode} onChange={event => { mode = event.target.value; render(value => value + 1); }}>
        <option value="success">Успех</option><option value="partial">Две занятые записи</option>
        <option value="busy">Аккаунт занят</option><option value="lost-second-ack">Потеря ответа второго пакета</option>
      </select>{" "}
      <label><input type="checkbox" checked={addLater} onChange={event => { addLater = event.target.checked; render(value => value + 1); }} />Добавить загрузку после открытия подтверждения</label>
      <p aria-label="Итог QA">В учебном хранилище: {records.length}. Запросы: {batches.map(batch => batch.length).join(", ") || "нет"}. Остаток: 172.</p>
    </aside>
    <AuthProvider key={generation}><BrowserRouter><App /></BrowserRouter></AuthProvider>
  </>;
}
createRoot(document.getElementById("root")).render(<Harness />);
