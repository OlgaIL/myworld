import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mapGuestDocumentInfo } from "../../server/utils/guest.js";
import { mapPhotoInfo } from "../../server/utils/photos.js";

const text = "Первый абзац.\n\nВторой абзац.";
const stored = { id: 1, filename: "synthetic.jpg", title: "Запись", status: "processed",
  ocr_text: text, clean_text: text, has_table: false,
  formatted_content: { blocks: [{ type: "paragraph", text: "Первый абзац." }, { type: "paragraph", text: "Второй абзац." }] } };

test("guest API flag reaches the real tabs through the page hook, before and after login", async t => {
  const vite = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: false,
    plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { default: Variants } = await vite.ssrLoadModule("/src/components/DocumentTextVariants.jsx");
    const { useGuestDocumentPageData } = await vite.ssrLoadModule("/src/hooks/useGuestDocumentPageData.js");
    function Guest({ document, pending }) {
      const { info } = useGuestDocumentPageData(document);
      return createElement(Variants, { documentId: "synthetic", info, isAuthenticated: false,
        initialTab: "formatted", enrichmentPending: pending, authProviders: [], onCopy: () => true });
    }
    const cases = [
      ["exact duplicate", {}, false],
      ["heading", { formatted_content: { blocks: [{ type: "heading", text: "Первый абзац." }, { type: "paragraph", text: "Второй абзац." }] } }, true],
      ["promoted title", { title: "Первый абзац." }, true],
      ["list", { formatted_content: { blocks: [{ type: "list", items: ["Первый абзац.", "Второй абзац."] }] } }, true],
      ["table source", { formatted_content: { blocks: [{ type: "table_source", text }] } }, true],
      ["possible table", { has_table: true }, true],
      ["unknown structure", { formatted_content: { blocks: [{ type: "unknown", text }] } }, true],
      ["unfinished processing", { status: "recognized" }, true]
    ];
    for (const [name, changes, visible] of cases) await t.test(name, () => {
      const row = { ...stored, ...changes };
      const guest = mapGuestDocumentInfo(row);
      const html = renderToStaticMarkup(createElement(Guest, { document: guest }));
      assert.equal(html.includes("Оформленный"), visible);
      assert.equal(html.includes("Оформленный вариант доступен после входа."), visible);
      const formattedTab = Array.from(html.matchAll(/<button\b[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/gu))
        .find(match => match[1].includes("Оформленный"));
      if (visible) assert.match(formattedTab?.[1] || "", /<svg/u, "useful guest variant keeps its lock");
      assert.doesNotMatch(html, /Скопировать оформленный текст|<h3>Первый абзац\./u);
      const authHtml = renderToStaticMarkup(createElement(Variants, {
        documentId: "synthetic", info: mapPhotoInfo(row), isAuthenticated: true,
        initialTab: "formatted", authProviders: [], onCopy: () => true
      }));
      assert.equal(authHtml.includes("Оформленный"), visible);
      assert.doesNotMatch(authHtml, /Оформленный вариант доступен после входа\./u);
    });
    await t.test("missing flag and missing blocks keep the lock; no client fallback can prove a guest duplicate", () => {
      for (const formattedIsRedundant of [undefined, false, "true", 1]) {
        const html = renderToStaticMarkup(createElement(Guest, { document: {
          ...mapGuestDocumentInfo(stored), formattedIsRedundant
        } }));
        assert.match(html, /Оформленный вариант доступен после входа\./u);
      }
      const html = renderToStaticMarkup(createElement(Guest, { document: mapGuestDocumentInfo({ ...stored, formatted_content: null }) }));
      assert.match(html, /Оформленный вариант доступен после входа\./u);
    });
    await t.test("pending UI keeps a tab even if a previous payload had a duplicate flag", () => {
      const html = renderToStaticMarkup(createElement(Guest, { document: mapGuestDocumentInfo(stored), pending: true }));
      assert.match(html, /Оформленный вариант доступен после входа\./u);
    });
    await t.test("stale guest flag cannot hide a changed original or improved text", () => {
      const html = renderToStaticMarkup(createElement(Variants, { documentId: "synthetic",
        info: mapGuestDocumentInfo(stored), isAuthenticated: false, initialTab: "formatted", authProviders: [],
        improvementRequest: { status: "improved", originalCleanText: "Другая исходная версия", improvedText: "Результат проверки" }
      }));
      assert.match(html, /Оформленный вариант доступен после входа\./u);
      assert.doesNotMatch(html, /Скопировать оформленный текст/u);
    });
  } finally { await vite.close(); }
});
