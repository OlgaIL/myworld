import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const paragraph = text => ({ type: "paragraph", text });
const base = { title: "Запись", status: "processed", cleanText: "Первый абзац.\n\nВторой абзац.",
  text: "Первый абзац.\n\nВторой абзац.", formattedContent: { blocks: [paragraph("Первый абзац."), paragraph("Второй абзац.")] } };

test("formatted tab is hidden only for an exact duplicate of plain paragraphs", async t => {
  const vite = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: false,
    plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { default: DocumentTextVariants } = await vite.ssrLoadModule("/src/components/DocumentTextVariants.jsx");
    const cases = [
      { name: "exact paragraphs hide the duplicate and fall back from an initial formatted tab", visible: false },
      { name: "different paragraph boundaries remain useful", info: { cleanText: "Первый абзац.\nВторой абзац." }, visible: true },
      { name: "different letter case remains visible", info: { cleanText: "первый абзац.\n\nВторой абзац." }, visible: true },
      { name: "spaces inside a line remain significant", info: { cleanText: "Первый  абзац.\n\nВторой абзац." }, visible: true },
      { name: "leading indentation remains significant", info: { cleanText: "  Первый абзац.\n\nВторой абзац." }, visible: true },
      { name: "different literal symbols remain significant", info: { cleanText: "Первый абзац;\n\nВторой абзац." }, visible: true },
      { name: "heading survives even when all text matches", info: { formattedContent: { blocks: [
        { type: "heading", text: "Первый абзац." }, paragraph("Второй абзац.") ] } }, visible: true },
      { name: "title promoted to a heading is preserved", info: { title: "Первый абзац." }, visible: true },
      { name: "list survives matching plain text", info: { cleanText: "- Первый пункт", formattedContent: {
        blocks: [{ type: "list", items: ["Первый пункт"] }] } }, visible: true },
      { name: "table survives matching plain text", info: { cleanText: "A\tB\n1\t2", formattedContent: {
        blocks: [{ type: "table", headers: ["A", "B"], rows: [["1", "2"]] }] } }, visible: true },
      { name: "table source stays visible before restoration", info: { cleanText: "Ячейки", formattedContent: {
        blocks: [{ type: "table_source", tableId: 1, text: "Ячейки" }] } }, visible: true },
      { name: "possible table blocks duplicate hiding", info: { hasTable: true }, visible: true },
      { name: "ready table awaiting download blocks duplicate hiding", info: { tableStatus: "ready" }, visible: true },
      { name: "table retry or error blocks duplicate hiding", info: { tableStatus: "error" }, visible: true },
      { name: "guest lock remains unchanged", authenticated: false, visible: true },
      { name: "recognized document keeps its existing state", info: { status: "recognized" }, pending: true, visible: true },
      { name: "unknown processing state is kept", info: { status: "loading" }, visible: true },
      { name: "unknown block type is not treated as a plain paragraph", info: { formattedContent: {
        blocks: [{ type: "formula", text: "Первый абзац." }, paragraph("Второй абзац.")] } }, visible: true },
      { name: "paragraph with unknown formatting metadata is kept", info: { formattedContent: {
        blocks: [{ ...paragraph("Первый абзац."), indent: 1 }, paragraph("Второй абзац.")] } }, visible: true },
      { name: "single block with internal blank lines is kept conservatively", info: { formattedContent: {
        blocks: [paragraph(base.cleanText)] } }, visible: true },
      { name: "plain fallback generated from the same text adds no structure", info: { formattedContent: null }, visible: false },
      { name: "empty result is not called a duplicate", info: { cleanText: "", text: "", formattedContent: null }, visible: true },
      { name: "original OCR tab is preserved when formatted duplicate disappears", info: { text: "Другой исходный OCR" }, visible: false, source: true },
      { name: "manual improved text different from Text is preserved", improvementRequest: {
        status: "improved", originalCleanText: base.cleanText, improvedText: "другое улучшенное содержимое" }, visible: true }
    ];
    for (const scenario of cases) await t.test(scenario.name, () => {
      const info = { ...base, ...scenario.info };
      const before = JSON.stringify(info);
      const html = renderToStaticMarkup(createElement(DocumentTextVariants, {
        documentId: "synthetic-visibility", info, isAuthenticated: scenario.authenticated !== false,
        initialTab: "formatted", authProviders: [], enrichmentPending: scenario.pending,
        improvementRequest: scenario.improvementRequest, onCopy: () => true
      }));
      const tabs = Array.from(html.matchAll(/<button\b[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/gu), match => ({
        label: match[1].replace(/<[^>]*>/gu, ""), selected: match[0].includes('aria-selected="true"')
      }));
      assert.equal(tabs.some(tab => tab.label === "Оформленный"), scenario.visible);
      if (!scenario.visible) {
        assert.doesNotMatch(html, /class="document-page__formatted"/u);
        assert.ok(html.includes("Первый абзац."));
        assert.ok(!tabs.length || tabs.some(tab => tab.label === "Текст" && tab.selected));
      }
      if (scenario.source) assert.ok(tabs.some(tab => tab.label === "Исходный (без замен)"));
      assert.equal(JSON.stringify(info), before, "display must not modify the saved result");
    });
  } finally { await vite.close(); }
});
