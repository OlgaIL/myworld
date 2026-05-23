const YANDEX_METRIKA_ID = import.meta.env.VITE_YANDEX_METRIKA_ID || "109386353";
const shouldUseYandexMetrika = import.meta.env.PROD && YANDEX_METRIKA_ID;

let yandexMetrikaInitialized = false;

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
