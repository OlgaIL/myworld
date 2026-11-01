import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

export default function DocumentNavigationScroll() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (!/^\/(?:guest-documents|documents)\/[^/]+\/?$/.test(pathname)) return;
    // Reset before paint for every document entry, including login handoff.
    // Data refreshes and tab/query changes must not move the reader.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
