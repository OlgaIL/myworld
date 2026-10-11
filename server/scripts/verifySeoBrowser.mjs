// Optional smoke check using an existing Playwright installation; no network,
// database, real authentication or OCR requests are needed.
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { createApp } from "../app.js";
import { PUBLIC_PAGE_SEO } from "../../client/src/publicPageSeo.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const server = http.createServer(createApp());
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.SEO_BROWSER_EXECUTABLE ? { executablePath: process.env.SEO_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext();
  // All APIs are mocked and all non-local resources are blocked before request.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      let payload = {};
      if (url.pathname === "/api/me") payload = null;
      if (url.pathname === "/api/auth-providers") payload = [{ id: "email", label: "Email" }];
      if (url.pathname === "/api/guest/document") payload = { documents: [], access: { documentLimit: 5, documentsUsed: 0, uploadAllowed: true } };
      return route.fulfill({ json: payload, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } });
    }
    if (url.origin === origin) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|hydrating|Minified React error/i.test(message.text())) errors.push(message.text());
  });
  for (const [pathname, seo] of Object.entries(PUBLIC_PAGE_SEO)) {
    await page.goto(`${origin}${pathname}?utm_source=local&yclid=123`);
    await page.waitForTimeout(300);
    assert.equal(await page.title(), seo.title);
    assert.equal(await page.locator("h1").count(), 1);
    for (const selector of ['title', 'meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]']) {
      assert.equal(await page.locator(selector).count(), 1, `${pathname}: ${selector}`);
    }
    assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), seo.description);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://word2you.ru${pathname}`);
  }
  // Hydrated carousel, lightbox and SPA navigation preserve one head and body.
  await page.getByRole("button", { name: /Следующий пример/ }).click();
  await page.getByRole("button", { name: /Увеличить исходное фото/ }).click();
  assert.equal(await page.getByRole("dialog").count(), 1);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("link", { name: "Фото в текст", exact: true }).click();
  assert.equal(await page.title(), PUBLIC_PAGE_SEO["/photo-to-text"].title);
  await page.getByRole("link", { name: "Попробовать бесплатно", exact: true }).first().click();
  await page.waitForSelector(".upload-zone:not([disabled])");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Перетащите сюда фото записи или выберите файл" }).click();
  await chooser;
  await page.getByRole("button", { name: "Вход", exact: true }).click();
  await page.getByRole("button", { name: "Email", exact: true }).click();
  if (await page.locator(".legal-modal").count()) {
    await page.locator('.legal-modal input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  }
  await page.waitForSelector('input[type="email"]');
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
  assert.equal(await page.title(), PUBLIC_PAGE_SEO["/"].title);
  assert.deepEqual(errors, []);
  console.log("SEO browser smoke passed: hydration, head, carousel/lightbox, SPA navigation, guest file chooser and email modal. External requests blocked.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
