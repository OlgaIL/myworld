const analyticsEnv = import.meta.env || {};
const YANDEX_METRIKA_ID = analyticsEnv.VITE_YANDEX_METRIKA_ID || "109386353";
const shouldUseYandexMetrika = analyticsEnv.PROD && YANDEX_METRIKA_ID;
const ACQUISITION_STORAGE_KEY = "word2you_acquisition_context";
const GOAL_STORAGE_PREFIX = "word2you_goal_once:";
const ACQUISITION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const ACQUISITION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid"];

let yandexMetrikaInitialized = false;

function readStoredJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function captureAcquisitionContext(defaultIntent = "") {
  const searchParams = new URLSearchParams(window.location.search);
  const context = {};

  ACQUISITION_KEYS.forEach((key) => {
    const value = searchParams.get(key)?.trim();
    if (value) {
      context[key] = value.slice(0, 500);
    }
  });

  const intent = searchParams.get("intent")?.trim() || defaultIntent.trim();
  if (intent) {
    context.intent = intent.slice(0, 500);
  }

  if (Object.keys(context).length === 0) {
    return getAcquisitionContext();
  }

  const capturedContext = {
    ...getAcquisitionContext(),
    ...context,
    landing_path: `${window.location.pathname}${window.location.search}`.slice(0, 1500),
    captured_at: new Date().toISOString()
  };

  try {
    window.localStorage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(capturedContext));
  } catch {
    // Analytics must never block the product flow.
  }

  return capturedContext;
}

export function getAcquisitionContext() {
  const context = readStoredJson(ACQUISITION_STORAGE_KEY);
  const capturedAt = Date.parse(context?.captured_at || "");

  if (!context || !Number.isFinite(capturedAt) || Date.now() - capturedAt > ACQUISITION_MAX_AGE_MS) {
    return {};
  }

  return context;
}

export function initYandexMetrika() {
  if (!shouldUseYandexMetrika || yandexMetrikaInitialized || window.ym) {
    return;
  }

  window.ym = function ymStub() {
    window.ym.a = window.ym.a || [];
    window.ym.a.push(arguments);
  };
  window.ym.l = Date.now();

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://mc.yandex.ru/metrika/tag.js";

  const firstScript = document.getElementsByTagName("script")[0];
  firstScript.parentNode.insertBefore(script, firstScript);

  window.ym(Number(YANDEX_METRIKA_ID), "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true
  });

  yandexMetrikaInitialized = true;
}

export function trackPageView(path) {
  if (!shouldUseYandexMetrika || !window.ym) {
    return;
  }

  window.ym(Number(YANDEX_METRIKA_ID), "hit", path);
}

export function trackGoal(goalName, params = {}) {
  if (!shouldUseYandexMetrika || !window.ym || !goalName) {
    return false;
  }

  try {
    window.ym(Number(YANDEX_METRIKA_ID), "reachGoal", goalName, {
      ...getAcquisitionContext(),
      ...params
    });
    return true;
  } catch {
    return false;
  }
}

export function trackGoalOnce(goalName, uniqueKey, params = {}) {
  if (!goalName || !uniqueKey) {
    return;
  }

  const storageKey = `${GOAL_STORAGE_PREFIX}${goalName}:${uniqueKey}`;

  try {
    if (window.localStorage.getItem(storageKey)) {
      return;
    }

    if (trackGoal(goalName, params)) {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    }
  } catch {
    trackGoal(goalName, params);
  }
}

function getMetrikaFunction(override) {
  if (typeof override === "function") {
    return override;
  }

  return typeof window !== "undefined" && typeof window.ym === "function" ? window.ym : null;
}

export function setAuthenticatedMetrikaUser(userId, ymOverride) {
  const ym = getMetrikaFunction(ymOverride);
  if (!userId || !ym) {
    return false;
  }

  try {
    ym(Number(YANDEX_METRIKA_ID), "setUserID", String(userId));
    return true;
  } catch {
    return false;
  }
}

export function requestMetrikaClientId(callback, ymOverride) {
  const ym = getMetrikaFunction(ymOverride);
  if (!ym || typeof callback !== "function") {
    return false;
  }

  try {
    ym(Number(YANDEX_METRIKA_ID), "getClientID", (clientId) => {
      try {
        callback(String(clientId || ""));
      } catch {
        // Analytics callbacks must never affect the product flow.
      }
    });
    return true;
  } catch {
    return false;
  }
}

export function requestMetrikaClientIdWhenReady(callback, {
  maxAttempts = 20,
  retryDelayMs = 250,
  getYm = () => getMetrikaFunction(),
  schedule = (handler, delay) => window.setTimeout(handler, delay)
} = {}) {
  let cancelled = false;
  let attempts = 0;

  const tryRequest = () => {
    if (cancelled) {
      return;
    }

    attempts += 1;
    const ym = getYm();

    if (requestMetrikaClientId(callback, ym)) {
      return;
    }

    if (attempts < maxAttempts) {
      schedule(tryRequest, retryDelayMs);
    }
  };

  tryRequest();

  return () => {
    cancelled = true;
  };
}

export function getAnalyticsDeviceContext(navigatorValue = typeof navigator !== "undefined" ? navigator : null) {
  const userAgent = String(navigatorValue?.userAgent || "").toLowerCase();
  const platform = String(navigatorValue?.userAgentData?.platform || navigatorValue?.platform || "").toLowerCase();
  const isTablet = userAgent.includes("ipad") || (userAgent.includes("android") && !userAgent.includes("mobile"));
  const isMobile = !isTablet && (userAgent.includes("iphone") || userAgent.includes("android") || userAgent.includes("mobile"));

  let deviceOs = "other";
  if (userAgent.includes("android") || platform.includes("android")) deviceOs = "android";
  else if (/iphone|ipad/.test(userAgent) || /iphone|ipad/.test(platform)) deviceOs = "ios";
  else if (platform.includes("win") || userAgent.includes("windows")) deviceOs = "windows";
  else if (platform.includes("mac") || userAgent.includes("mac os")) deviceOs = "macos";
  else if (platform.includes("linux") || userAgent.includes("linux")) deviceOs = "linux";

  let deviceBrowser = "other";
  if (userAgent.includes("yabrowser")) deviceBrowser = "yandex";
  else if (userAgent.includes("edg/")) deviceBrowser = "edge";
  else if (userAgent.includes("firefox")) deviceBrowser = "firefox";
  else if (userAgent.includes("chrome") || userAgent.includes("crios")) deviceBrowser = "chrome";
  else if (userAgent.includes("safari")) deviceBrowser = "safari";

  return {
    deviceType: isTablet ? "tablet" : isMobile ? "mobile" : "desktop",
    deviceOs,
    deviceBrowser
  };
}
