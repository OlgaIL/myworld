const env = import.meta.env || {};
// Consent for a different analytics provider is not reused.
export const INSPECTLET_CONSENT_KEY = "word2you_inspectlet_consent_v1";
export const INSPECTLET_CONSENT_EVENT = "word2you:inspectlet-consent";
const PUBLIC_PATHS = new Set(["/", "/about", "/account", "/packages", "/privacy", "/consent", "/terms", "/requisites", "/photo-to-text", "/handwriting-to-text", "/batch-photo-to-text", "/table-from-photo"]);

// Do not send arbitrary path names, query strings, fragments or referrers.
// Document routes contain server-generated identifiers, never document titles.
export function isInspectletUrlSafe(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.search && !url.hash && (
      PUBLIC_PATHS.has(url.pathname)
      || /^\/guest-documents\/\d+$/.test(url.pathname)
      || /^\/documents\/\d{13}-[a-f0-9-]{36}(?:-guest)?\.(?:jpe?g|png|webp|heic|heif)$/i.test(url.pathname)
    );
  } catch { return false; }
}

export function isInspectletReferrerSafe(value, origin) {
  if (!value || isInspectletUrlSafe(value, origin)) return true;
  try {
    const url = new URL(value);
    // Cross-origin browsers normally disclose just the referring origin.
    return ["https:", "http:"].includes(url.protocol) && url.pathname === "/"
      && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function createInspectletController(win, doc, config = env) {
  let injected = false;
  let installed = false;
  const hosts = (config.VITE_INSPECTLET_HOSTS || "word2you.ru").split(",").map(host => host.trim());
  const enabled = config.PROD && config.VITE_INSPECTLET_ENABLED !== "false" && hosts.includes(win.location.hostname);
  const safe = value => isInspectletUrlSafe(value, win.location.origin);

  function sync() {
    if (!enabled || injected || !safe(win.location.href)) return;
    // Referrers can also contain document names, login tokens and email addresses.
    if (!isInspectletReferrerSafe(doc.referrer, win.location.origin)) return;
    try {
      if (win.localStorage.getItem(INSPECTLET_CONSENT_KEY) !== "granted") return;
      injected = true;
      win.__insp = win.__insp || [];
      win.__insp.push(["wid", 390286863]);
      if (win.__inspld !== undefined) return;
      win.__inspld = 1;
      const script = doc.createElement("script");
      script.async = true;
      script.src = `https://cdn.inspectlet.com/inspectlet.js?wid=390286863&r=${Math.floor(Date.now() / 3600000)}`;
      script.id = "inspsync";
      script.onerror = () => {}; // Failure must not affect the application.
      doc.head.appendChild(script);
    } catch { /* Storage, CSP and blockers must not break the product. */ }
  }

  function install() {
    if (installed || !enabled) return;
    installed = true;
    // Installed before Inspectlet and the router: private destinations load in a
    // fresh document where no recorder is started, including SPA/back navigation.
    for (const method of ["pushState", "replaceState"]) {
      const original = win.history[method];
      win.history[method] = function (state, unused, url) {
        if (injected && url != null && !safe(url)) {
          win.location[method === "replaceState" ? "replace" : "assign"](url);
          return;
        }
        return original.call(this, state, unused, url);
      };
    }
    win.addEventListener("popstate", event => {
      if (injected && !safe(win.location.href)) {
        event.stopImmediatePropagation?.();
        win.location.reload();
      }
    }, true);
    win.addEventListener(INSPECTLET_CONSENT_EVENT, sync);
    win.addEventListener("storage", event => {
      if (event.key !== INSPECTLET_CONSENT_KEY) return;
      if (event.newValue !== "granted" && injected) {
        win.location.reload();
      } else sync();
    });
  }

  function chooseConsent(granted) {
    try { win.localStorage.setItem(INSPECTLET_CONSENT_KEY, granted ? "granted" : "denied"); } catch { return false; }
    if (!granted && injected) {
      win.location.reload();
    } else win.dispatchEvent(new Event(INSPECTLET_CONSENT_EVENT));
    return true;
  }
  return { install, sync, chooseConsent, isPrivateTransition: value => injected && !safe(value || win.location.href) };
}

export const inspectletController = typeof window === "undefined" ? null : createInspectletController(window, document);
