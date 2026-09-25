const SITE_ORIGIN = "https://word2you.ru";

export const PUBLIC_PAGE_PATHS = Object.freeze([
  "/",
  "/photo-to-text",
  "/handwriting-to-text",
  "/about",
  "/packages",
  "/terms",
  "/privacy",
  "/consent",
  "/requisites"
]);

const publicPagePaths = new Set(PUBLIC_PAGE_PATHS);
const privatePagePaths = new Set(["/account", "/admin-control"]);

export function isPublicPagePath(pathname) {
  return publicPagePaths.has(pathname);
}

export function isPrivatePagePath(pathname) {
  return privatePagePaths.has(pathname)
    || /^\/documents\/[^/]+$/.test(pathname)
    || /^\/guest-documents\/[^/]+$/.test(pathname);
}

export function isFrontendPagePath(pathname) {
  return isPublicPagePath(pathname) || isPrivatePagePath(pathname);
}

export function isServicePath(pathname) {
  return pathname === "/api"
    || pathname.startsWith("/api/")
    || pathname === "/admin-api"
    || pathname.startsWith("/admin-api/")
    || pathname === "/auth"
    || pathname.startsWith("/auth/")
    || pathname === "/logout";
}

export function canonicalUrlFor(pathname) {
  return isPublicPagePath(pathname) ? `${SITE_ORIGIN}${pathname}` : null;
}

export function buildRobotsTxt() {
  return [
    "User-agent: *",
    "Disallow: /account",
    "Disallow: /admin-control",
    "Disallow: /documents/",
    "Disallow: /guest-documents/",
    "Disallow: /api/",
    "Disallow: /admin-api/",
    "Disallow: /auth/",
    "Disallow: /logout",
    "Sitemap: https://word2you.ru/sitemap.xml",
    ""
  ].join("\n");
}

export function buildSitemapXml() {
  const urls = PUBLIC_PAGE_PATHS
    .map((pathname) => `  <url><loc>${canonicalUrlFor(pathname)}</loc></url>`)
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    ""
  ].join("\n");
}

export function injectSeoHead(html, pathname) {
  const canonicalUrl = canonicalUrlFor(pathname);
  const tags = canonicalUrl
    ? `<link rel="canonical" href="${canonicalUrl}" />`
    : '<meta name="robots" content="noindex, nofollow" />';

  return html.replace("</head>", `    ${tags}\n  </head>`);
}

export function buildNotFoundHtml() {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Страница не найдена | Word2you</title>
  </head>
  <body>
    <main>
      <h1>Страница не найдена</h1>
      <p><a href="/">На главную</a></p>
      <p><a href="/photo-to-text">Фото в текст</a></p>
      <p><a href="/handwriting-to-text">Рукописный текст</a></p>
    </main>
  </body>
</html>`;
}
