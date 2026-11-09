import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { normalizePublicLimits, processingCountText } from "../src/utils/publicLimits.js";

test("allowance grammar and missing values do not hardcode the current offer", () => {
  assert.equal(processingCountText(1), "1 обработка");
  assert.equal(processingCountText(3), "3 обработки");
  assert.equal(processingCountText(5), "5 обработок");
  assert.equal(processingCountText(10), "10 обработок");
  assert.equal(processingCountText(21), "21 обработка");
  assert.deepEqual(normalizePublicLimits({ guestDocumentLimit: "3", freeProcessingLimit: -1 }), { guestDocumentLimit: null, freeProcessingLimit: null });
});

test("all public offer surfaces follow supplied limits and can return to ten without editing their copy", async () => {
  const vite = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: false,
    plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const { PublicLimitsProvider } = await vite.ssrLoadModule("/src/contexts/PublicLimitsContext.jsx");
    const components = await Promise.all(["/src/components/GuestHome.jsx", "/src/pages/AboutPage.jsx",
      "/src/pages/HandwritingToTextLanding.jsx", "/src/components/GuestDocumentSaveCta.jsx"].map(path => vite.ssrLoadModule(path)));
    for (const limits of [{ guestDocumentLimit: 3, freeProcessingLimit: 5 }, { guestDocumentLimit: 7, freeProcessingLimit: 10 }]) {
      const rendered = components.map(({ default: Component }) => renderToStaticMarkup(createElement(MemoryRouter, null,
        createElement(PublicLimitsProvider, { initialLimits: limits }, createElement(Component, {
          documents: [], loading: false, authProviders: [], providers: [], documentId: "synthetic", documentStatus: "processed",
          access: { documentLimit: 99, documentsUsed: 0, uploadAllowed: true }
        })))));
      assert.ok(rendered[0].includes(`До ${limits.guestDocumentLimit} обработок без регистрации`));
      for (const html of rendered) assert.match(html, new RegExp(`${limits.freeProcessingLimit}(?: обработок| после входа)`));
      assert.ok(rendered[1].includes(`${limits.guestDocumentLimit} ${limits.guestDocumentLimit === 3 ? "обработки" : "обработок"}`));
    }
    for (const { default: Component } of components) {
      const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PublicLimitsProvider, null,
        createElement(Component, { documents: [], loading: false, authProviders: [], providers: [] }))));
      assert.doesNotMatch(html, /(?:3|5|10) обработ(?:ка|ки|ок)/u);
      assert.doesNotMatch(html, /null обработ|undefined обработ/u);
    }
  } finally { await vite.close(); }
});
