const env = import.meta.env || {};
// Earlier consent excluded account details; ask again before recording them.
export const CLARITY_CONSENT_KEY = "word2you_clarity_consent_v3_account";
export const CLARITY_CONSENT_EVENT = "word2you:clarity-consent";
const PUBLIC_PATHS = new Set(["/", "/about", "/account", "/packages", "/privacy", "/consent", "/terms", "/requisites", "/photo-to-text", "/handwriting-to-text", "/batch-photo-to-text", "/table-from-photo"]);

// Do not send arbitrary path names, query strings, fragments or referrers.
// Document routes contain server-generated identifiers, never document titles.
export function isClarityUrlSafe(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.search && !url.hash && (
      PUBLIC_PATHS.has(url.pathname)
      || /^\/guest-documents\/\d+$/.test(url.pathname)
      || /^\/documents\/\d{13}-[a-f0-9-]{36}(?:-guest)?\.(?:jpe?g|png|webp|heic|heif)$/i.test(url.pathname)
    );
  } catch { return false; }
}

export function isClarityReferrerSafe(value, origin) {
  if (!value || isClarityUrlSafe(value, origin)) return true;
  try {
    const url = new URL(value);
    // Cross-origin browsers normally disclose just the referring origin.
    return ["https:", "http:"].includes(url.protocol) && url.pathname === "/"
      && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function createClarityController(win, doc, config = env) {
  let injected = false;
  let installed = false;
  const hosts = (config.VITE_CLARITY_HOSTS || "word2you.ru").split(",").map(host => host.trim());
  const enabled = config.PROD && config.VITE_CLARITY_ENABLED !== "false" && hosts.includes(win.location.hostname);
  const safe = value => isClarityUrlSafe(value, win.location.origin);
  const call = (...args) => { try { win.clarity?.(...args); } catch { /* Optional analytics. */ } };

  function sync() {
    if (!enabled || injected || !safe(win.location.href)) return;
    // Referrers can also contain document names, login tokens and email addresses.
    if (!isClarityReferrerSafe(doc.referrer, win.location.origin)) return;
    try {
      if (win.localStorage.getItem(CLARITY_CONSENT_KEY) !== "granted") return;
      injected = true;
      win.clarity = win.clarity || function (...args) { (win.clarity.q = win.clarity.q || []).push(args); };
      call("consentv2", { analytics_Storage: "granted", ad_Storage: "denied" });
      const script = doc.createElement("script");
      script.async = true;
      script.src = "https://www.clarity.ms/tag/yy89cpbeew";
      script.id = "word2you-clarity";
      script.onerror = () => {}; // Failure must not affect the application.
      doc.head.appendChild(script);
    } catch { /* Storage, CSP and blockers must not break the product. */ }
  }

  function install() {
    if (installed || !enabled) return;
    installed = true;
    // Installed before Clarity and the router: private destinations load in a
    // fresh document where no recorder is started, including SPA/back navigation.
    for (const method of ["pushState", "replaceState"]) {
      const original = win.history[method];
      win.history[method] = function (state, unused, url) {
        if (injected && url != null && !safe(url)) {
          call("stop");
          win.location[method === "replaceState" ? "replace" : "assign"](url);
          return;
        }
        return original.call(this, state, unused, url);
      };
    }
    win.addEventListener("popstate", () => {
      if (injected && !safe(win.location.href)) { call("stop"); win.location.reload(); }
    });
    win.addEventListener(CLARITY_CONSENT_EVENT, sync);
    win.addEventListener("storage", event => {
      if (event.key !== CLARITY_CONSENT_KEY) return;
      if (event.newValue !== "granted" && injected) {
        call("consentv2", { analytics_Storage: "denied", ad_Storage: "denied" });
        call("stop");
        win.location.reload();
      } else sync();
    });
  }

  function chooseConsent(granted) {
    try { win.localStorage.setItem(CLARITY_CONSENT_KEY, granted ? "granted" : "denied"); } catch { return false; }
    if (!granted && injected) {
      call("consentv2", { analytics_Storage: "denied", ad_Storage: "denied" });
      call("stop");
      win.location.reload();
    } else win.dispatchEvent(new Event(CLARITY_CONSENT_EVENT));
    return true;
  }
  return { install, sync, chooseConsent, isPrivateTransition: value => injected && !safe(value || win.location.href) };
}

export const clarityController = typeof window === "undefined" ? null : createClarityController(window, document);
