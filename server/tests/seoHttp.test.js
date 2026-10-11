import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PUBLIC_PAGE_PATHS } from "../seo.js";

let baseUrl;
let fixtureDir;
let server;
const builtClientDir = fileURLToPath(new URL("../../client/dist/", import.meta.url));

before(async () => {
  // Keep `npm run test:seo` self-contained while checking real build output.
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    await import("../../client/scripts/build.mjs");
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
  // Load server env only after the client build, so dotenv cannot override
  // the client's VITE_* build configuration in this shared test process.
  const { createApp } = await import("../app.js");
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "word2you-seo-"));
  // Test actual output, not a hand-written substitute.
  fs.copyFileSync(path.join(builtClientDir, "index.html"), path.join(fixtureDir, "index.html"));
  fs.cpSync(path.join(builtClientDir, ".prerender"), path.join(fixtureDir, ".prerender"), { recursive: true });

  server = http.createServer(createApp({ clientDistDirectory: fixtureDir }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
});

test("serves a real robots.txt with private routes and sitemap", async () => {
  const response = await fetch(`${baseUrl}/robots.txt`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/plain\b/);
  assert.match(body, /^User-agent: \*/m);
  assert.match(body, /^Disallow: \/account$/m);
  assert.match(body, /^Disallow: \/documents\/$/m);
  assert.match(body, /^Disallow: \/logout$/m);
  assert.match(body, /^Sitemap: https:\/\/word2you\.ru\/sitemap\.xml$/m);
  assert.doesNotMatch(body, /Disallow: \/photo-to-text/);
});

test("serves an XML sitemap with only canonical public URLs", async () => {
  const response = await fetch(`${baseUrl}/sitemap.xml`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/xml\b/);
  assert.match(body, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  for (const pathname of PUBLIC_PAGE_PATHS) {
    const url = `https://word2you.ru${pathname}`;
    assert.match(body, new RegExp(`<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`));
  }
  assert.doesNotMatch(body, /admin-control|\/account|\/documents\/|\/api\/|\/auth\/|<loc>[^<]*\?/);
});

test("adds a self-canonical to every public page source", async () => {
  for (const pathname of PUBLIC_PAGE_PATHS) {
    const response = await fetch(`${baseUrl}${pathname}`);
    const body = await response.text();
    const canonical = `https://word2you.ru${pathname}`;

    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type"), /^text\/html\b/, pathname);
    assert.match(body, new RegExp(`<link rel="canonical" href="${canonical}" \\/>`), pathname);
    assert.equal((body.match(/rel="canonical"/g) || []).length, 1, pathname);
  }
});

test("serves unique meaningful React prerenders without JavaScript or bot-specific content", async () => {
  const pages = [
    { path: "/", title: "Фото записи в текст и личный архив — Word2you", h1: "Фото записи — в текст и личный архив", text: "Загрузите фото с телефона" },
    { path: "/photo-to-text", title: "Фото в текст онлайн и личный архив записей — Word2you", h1: "Фото и записи — в личный цифровой архив", text: "Конспекты и заметки" },
    { path: "/handwriting-to-text", title: "Распознать рукописный текст с фото онлайн — Word2you", h1: "Превратите рукописный текст в понятную цифровую запись", text: "Качество результата зависит от фотографии и разборчивости почерка" }
  ];
  const descriptions = new Set();
  for (const page of pages) {
    const response = await fetch(`${baseUrl}${page.path}?utm_source=test&yclid=123`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-robots-tag"), null);
    assert.ok(body.includes(`<title>${page.title}</title>`), page.path);
    assert.match(body, /data-prerendered="true"/);
    const h1s = [...body.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/gs)];
    assert.equal(h1s.length, 1, page.path);
    assert.equal(h1s[0][1], page.h1);
    assert.ok(body.includes(page.text), page.path);
    assert.match(body, /<a\b[^>]*href="\/about"/);
    assert.match(body, /<a\b[^>]*href="\/privacy"/);
    for (const pattern of [/<title\b/g, /name="description"/g, /property="og:title"/g, /property="og:description"/g, /property="og:url"/g, /rel="canonical"/g]) {
      assert.equal([...body.matchAll(pattern)].length, 1, `${page.path}: ${pattern}`);
    }
    const description = body.match(/<meta name="description" content="([^"]+)"/)[1];
    assert.ok(description.length > 80);
    descriptions.add(description);
    assert.ok(body.includes(`property="og:url" content="https://word2you.ru${page.path}"`));
    const botBody = await (await fetch(`${baseUrl}${page.path}?utm_source=test&yclid=123`, { headers: { "User-Agent": "YandexBot" } })).text();
    assert.equal(botBody, body);
    const head = await fetch(`${baseUrl}${page.path}`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  }
  assert.equal(descriptions.size, 3);
});

test("keeps build prerender files private", async () => {
  const response = await fetch(`${baseUrl}/.prerender/home.html`);
  assert.equal(response.status, 404);
});

test("removes only etext and preserves analytics parameters", async () => {
  const response = await fetch(
    `${baseUrl}/handwriting-to-text?utm_source=yandex&etext=external-token&yclid=123`,
    { redirect: "manual" }
  );

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/handwriting-to-text?utm_source=yandex&yclid=123");

  const analyticsResponse = await fetch(
    `${baseUrl}/handwriting-to-text?utm_source=yandex&yclid=123`,
    { redirect: "manual" }
  );
  assert.equal(analyticsResponse.status, 200);
  assert.match(
    await analyticsResponse.text(),
    /<link rel="canonical" href="https:\/\/word2you\.ru\/handwriting-to-text" \/>/
  );
});

test("redirects a known trailing slash and keeps the query", async () => {
  const response = await fetch(`${baseUrl}/photo-to-text/?utm_source=test`, { redirect: "manual" });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/photo-to-text?utm_source=test");
});

test("marks private frontend routes noindex and excludes them from canonical output", async () => {
  for (const pathname of ["/account", "/admin-control", "/documents/example", "/guest-documents/example"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    const body = await response.text();

    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", pathname);
    assert.match(body, /<meta name="robots" content="noindex, nofollow" \/>/, pathname);
    assert.doesNotMatch(body, /rel="canonical"/, pathname);
  }
});

test("returns real HTML and JSON 404 responses", async () => {
  const pageResponse = await fetch(`${baseUrl}/seo-audit-missing-test`);
  const pageBody = await pageResponse.text();
  assert.equal(pageResponse.status, 404);
  assert.match(pageResponse.headers.get("content-type"), /^text\/html\b/);
  assert.match(pageBody, /<h1>Страница не найдена<\/h1>/);
  assert.match(pageBody, /<meta name="robots" content="noindex, nofollow" \/>/);

  const apiResponse = await fetch(`${baseUrl}/api/seo-audit-missing-test`);
  assert.equal(apiResponse.status, 404);
  assert.equal(apiResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(apiResponse.headers.get("content-type"), /^application\/json\b/);
  assert.deepEqual(await apiResponse.json(), { error: "NOT_FOUND" });
});
