import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { AI_UNAVAILABLE_MESSAGE, AI_CONNECTION_UNAVAILABLE_MESSAGE, getAiUnavailableMessage } from "../src/constants/documentStatuses.js";
import { buildRecognizedResult } from "../../server/services/partialProcessingService.js";

test("saved failure causes choose the same public message on server and client, including legacy documents", async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: "custom" });
  try {
    const [{ default: Gallery }, { default: GuestDocumentCard }, { default: DocumentPage }, { default: DocumentTextVariants }] = await Promise.all([
      vite.ssrLoadModule("/src/components/Gallery.jsx"),
      vite.ssrLoadModule("/src/components/GuestDocumentCard.jsx"),
      vite.ssrLoadModule("/src/components/DocumentPage.jsx"),
      vite.ssrLoadModule("/src/components/DocumentTextVariants.jsx")
    ]);
    for (const code of ["TIMEWEB_NETWORK_ERROR", "TIMEWEB_TIMEOUT", "TIMEWEB_REQUEST_ERROR",
      "TIMEWEB_AUTH_ERROR", "TIMEWEB_LIMIT_ERROR", "TIMEWEB_SERVICE_ERROR", "TIMEWEB_INVALID_JSON",
      "TIMEWEB_RESPONSE_TRUNCATED", "Yandex GPT failed", "", "other TIMEWEB_TIMEOUT"]) {
      const error = code.startsWith("TIMEWEB_") ? `Timeweb: ${code}` : code;
      const expected = ["TIMEWEB_NETWORK_ERROR", "TIMEWEB_TIMEOUT"].includes(code)
        ? AI_CONNECTION_UNAVAILABLE_MESSAGE : AI_UNAVAILABLE_MESSAGE;
      const stored = buildRecognizedResult("Учебный распознанный текст", error);
      assert.equal(stored.aiNotes, expected, code);
      assert.equal(getAiUnavailableMessage(error), expected, code);
      if (!["TIMEWEB_NETWORK_ERROR", "TIMEWEB_TIMEOUT", "TIMEWEB_REQUEST_ERROR"].includes(code)) continue;
      // Existing documents may still contain the old general note: the saved
      // failure code, not that note, must drive every current display surface.
      const info = { id: "synthetic", name: "synthetic.jpg", status: stored.status, title: "Учебная запись",
        text: stored.ocrText, cleanText: stored.cleanText, notes: AI_UNAVAILABLE_MESSAGE, error: stored.errorMessage,
        formattedContent: stored.formattedContent, tags: [], corrections: [] };
      const pageProps = { photo: info, info, copiedMap: {}, onRetryProcessing() {} };
      const views = [
        createElement(Gallery, { photos: [info] }),
        createElement(GuestDocumentCard, { document: info }),
        createElement(DocumentPage, { ...pageProps, isAuthenticated: false }),
        createElement(DocumentPage, { ...pageProps, isAuthenticated: true }),
        createElement(DocumentTextVariants, { documentId: info.name, info, copiedMap: {}, initialTab: "formatted",
          isAuthenticated: true, enrichmentPending: true })
      ];
      for (const view of views) {
        const html = renderToStaticMarkup(createElement(MemoryRouter, null, view));
        assert.ok(html.includes(expected), `${code}: ${view.type.name || "component"}`);
        assert.doesNotMatch(html, /Timeweb:|TIMEWEB_/);
        if (expected === AI_UNAVAILABLE_MESSAGE) assert.ok(!html.includes("проблем со связью"));
      }
    }
  } finally { await vite.close(); }
});
