import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "esbuild";
import { readFile } from "node:fs/promises";
import { createLatestLoader } from "../src/utils/latestLoader.js";

const source = (await readFile(new URL("../src/components/AdminGuestStorage.jsx", import.meta.url), "utf8")).replace(/^import .*$/gm, "");
// Compile the actual presentation component without HTTP or browser effects.
const compiled = await transform(source, { loader: "jsx", format: "cjs", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
const compiledModule = { exports: {} };
new Function("React", "module", compiled.code)(React, compiledModule);
const { GuestStorageContent } = compiledModule.exports;
const render = (props) => renderToStaticMarkup(React.createElement(GuestStorageContent, props));
const data = { collectedAt: "2026-10-12T00:00:00Z", generatedAt: "2026-10-12T01:00:00Z", periodStart: "2026-10-11T01:00:00Z", periodEnd: "2026-10-12T01:00:00Z",
  period: { uploads: 0, processed: 0, recognized: 0, no_text: 0, error: 0, documentsDeleted: 0, filesRemoved: 0, filesMissing: 0, incompleteFiles: 0, categories: {} },
  current: { stored: 7, expired: 2 }, schedule: { timezone: null, warning: "schedule_unconfigured" }, latest: null, lastSuccess: null };

test("SSR loading/error/unknown history never masquerade as successful zeros", () => {
  assert.match(render({}), /Загрузка/);
  const error = render({ error: true, data });
  assert.match(error, /role="alert"/); assert.match(error, /недоступна/); assert.doesNotMatch(error, /Принятые загрузки/);
  const empty = render({ data }); assert.match(empty, /до начала сбора история неизвестна/); assert.match(empty, /данных ещё нет/);
  assert.match(empty, /Часовой пояс очистки ещё не задан/); assert.match(empty, /<strong>7<\/strong>/); assert.match(empty, /<strong>2<\/strong>/);
  const local = render({ data: { ...data, schedule: { timezone: "Europe/Istanbul", source: "local_backend" } } });
  assert.match(local, /Локально: при работающем backend/);
  assert.doesNotMatch(local, /Запуск через cron/);
});

test("SSR shows textual success at zero, interruption, last success and incompleteness", () => {
  const success = { id: "one", state: "success", started_at: data.generatedAt, finished_at: data.generatedAt, counters: { deleted: 0, filesRemoved: 0, errors: 0 } };
  assert.match(render({ data: { ...data, latest: success } }), /Последняя очистка: Успешно/);
  const html = render({ data: { ...data, latest: { ...success, state: "interrupted", incomplete: true }, lastSuccess: success,
    period: { ...data.period, incompleteFiles: 1 }, schedule: { timezone: "Europe/Istanbul", warning: "missed_schedule" } } });
  assert.match(html, /Вероятно прервано/); assert.match(html, /Последняя успешная очистка: Успешно/); assert.match(html, /нижняя граница/); assert.match(html, /Ожидаемый запуск пропущен/);
});

test("request gate ignores stale success/error and disposed period", async () => {
  const pending = [], output = [];
  const loader = createLatestLoader(() => new Promise((resolve, reject) => pending.push({ resolve, reject })), (data) => output.push(data), () => output.push("error"));
  const first = loader.refresh(), second = loader.refresh();
  pending[1].resolve("new"); await second; pending[0].resolve("old"); await first;
  assert.deepEqual(output, ["new"]);
  const third = loader.refresh(), fourth = loader.refresh(); pending[3].resolve("newer"); await fourth; pending[2].reject(new Error("stale error")); await third;
  assert.deepEqual(output, ["new", "newer"]);
  const last = loader.refresh(); loader.dispose(); pending[4].resolve("old period"); await last;
  assert.deepEqual(output, ["new", "newer"]);
});
