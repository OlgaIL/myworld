import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { PUBLIC_PAGE_SEO } from "../publicPageSeo";

export default function PromoNavigationScroll() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    // Leave history restoration and document/account scrolling to their owners.
    if (navigationType === "POP" || pathname === "/" || !PUBLIC_PAGE_SEO[pathname]) return;

    let anchor = hash.slice(1);
    try {
      anchor = decodeURIComponent(anchor);
    } catch {
      // A malformed fragment must not interrupt navigation.
    }
    const target = anchor ? document.getElementById(anchor) : null;
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "instant" });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [pathname, hash, key, navigationType]);

  return null;
}
