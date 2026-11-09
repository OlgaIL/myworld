import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { PUBLIC_PAGE_SEO, SITE_ORIGIN } from "../publicPageSeo";
import { usePublicLimits } from "../contexts/PublicLimitsContext";

const PUBLIC_PATHS = new Set([...Object.keys(PUBLIC_PAGE_SEO), "/packages", "/terms", "/privacy", "/consent", "/requisites"]);

function setHeadTag(selector, tag, attributes) {
  const existing = [...document.head.querySelectorAll(selector)];
  const element = existing.shift() || document.createElement(tag);
  existing.forEach((duplicate) => duplicate.remove());
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (!element.parentNode) document.head.append(element);
}

export default function PageSeo() {
  const { pathname } = useLocation();
  const { guestDocumentLimit } = usePublicLimits();
  useEffect(() => {
    const seo = PUBLIC_PAGE_SEO[pathname] || PUBLIC_PAGE_SEO["/"];
    const description = seo.description + (pathname === "/" && guestDocumentLimit != null
      ? ` До ${guestDocumentLimit} обработок без регистрации.` : "");
    document.title = seo.title;
    setHeadTag('meta[name="description"]', "meta", { name: "description", content: description });
    setHeadTag('meta[property="og:title"]', "meta", { property: "og:title", content: seo.title });
    setHeadTag('meta[property="og:description"]', "meta", { property: "og:description", content: description });
    if (PUBLIC_PATHS.has(pathname)) {
      const canonical = `${SITE_ORIGIN}${pathname}`;
      setHeadTag('link[rel="canonical"]', "link", { rel: "canonical", href: canonical });
      setHeadTag('meta[property="og:url"]', "meta", { property: "og:url", content: canonical });
      document.head.querySelectorAll('meta[name="robots"]').forEach((tag) => tag.remove());
    } else {
      document.head.querySelectorAll('link[rel="canonical"], meta[property="og:url"]').forEach((tag) => tag.remove());
      setHeadTag('meta[name="robots"]', "meta", { name: "robots", content: "noindex, nofollow" });
    }
  }, [pathname, guestDocumentLimit]);
  return null;
}
