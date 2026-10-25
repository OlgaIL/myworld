import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, normalizePath } from "vite";
import { PUBLIC_PAGE_SEO } from "../src/publicPageSeo.js";
import { injectSeoHead } from "../../server/seo.js";

const root = normalizePath(fileURLToPath(new URL("../", import.meta.url)));
// Vite's module runner loads the JS config directly. This avoids the config
// bundler's Windows path/ancestor-directory access and works from any cwd.
const options = { root, configLoader: "runner" };
await build(options);
await build({ ...options, build: { ssr: "src/prerender.jsx", outDir: "dist-ssr" } });
const { renderPage } = await import(pathToFileURL(path.join(root, "dist-ssr/prerender.js")));
const template = await fs.readFile(path.join(root, "dist/index.html"), "utf8");
const outputDir = path.join(root, "dist/.prerender");
await fs.mkdir(outputDir, { recursive: true });
for (const [pathname, seo] of Object.entries(PUBLIC_PAGE_SEO)) {
  const body = renderPage(pathname);
  if (!body.includes("<h1")) throw new Error(`Prerender missing H1: ${pathname}`);
  const html = injectSeoHead(template, pathname).replace(
    '<div id="root"></div>',
    `<div id="root" data-prerendered="true">${body}</div>`
  );
  if (!html.includes('data-prerendered="true"')) throw new Error("Prerender root placeholder missing");
  await fs.writeFile(path.join(outputDir, seo.file), html);
}
console.log(`Prerendered ${Object.keys(PUBLIC_PAGE_SEO).join(", ")}`);
