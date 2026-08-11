const YANDEX_METRIKA_ID = import.meta.env.VITE_YANDEX_METRIKA_ID || "109386353";
const shouldUseYandexMetrika = import.meta.env.PROD && YANDEX_METRIKA_ID;
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

export function captureAcquisitionContext() {
  const searchParams = new URLSearchParams(window.location.search);
  const context = {};

  ACQUISITION_KEYS.forEach((key) => {
    const value = searchParams.get(key)?.trim();
    if (value) {
      context[key] = value.slice(0, 500);
    }
  });

  if (Object.keys(context).length === 0) {
    return getAcquisitionContext();
  }

  const capturedContext = {
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

  window.ym(Number(YANDEX_METRIKA_ID), "reachGoal", goalName, {
    ...getAcquisitionContext(),
    ...params
  });
  return true;
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
