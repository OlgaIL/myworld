import { isPublicPagePath } from "../seo.js";

const MINUTE = 60_000;
const NO_UPLOAD_WINDOW = 3 * 60 * MINUTE;
const SERVER_ERROR_COOLDOWN = 15 * MINUTE;
const moscowTime = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short"
});
const paidMedia = new Set(["cpc", "ppc", "cpm", "paid", "paid_search", "paid_social"]);
const directSources = new Set(["yandex-direct", "ya-direct", "yandex_direct"]);

function uploadRequest(method, path) {
  if (method === "POST" && /^\/api\/guest\/upload\/?$/i.test(path)) {
    return { label: "Гость", savesFile: true };
  }
  if (method === "POST" && /^\/api\/upload\/?$/i.test(path)) {
    return { label: "Личный кабинет", savesFile: true };
  }
  if (method === "PUT" && /^\/api\/document-uploads\/[^/]+\/items\/[^/]+\/?$/i.test(path)) {
    return { label: "Личный кабинет", savesFile: true };
  }
  if (method === "POST" && /^\/api\/document-uploads(?:\/[^/]+\/finish)?\/?$/i.test(path)) {
    return { label: "Личный кабинет", savesFile: false };
  }
  return null;
}

function isAdLanding(req) {
  if (req.method !== "GET" || !isPublicPagePath(req.path)) return false;
  if (/prefetch|prerender/i.test(`${req.get("Sec-Purpose") || ""} ${req.get("Purpose") || ""}`)) return false;

  const { yclid, utm_medium: medium, utm_source: source } = req.query;
  return (typeof yclid === "string" && /^\d{1,64}$/.test(yclid))
    || (typeof medium === "string" && paidMedia.has(medium.trim().toLowerCase()))
    || (typeof source === "string" && directSources.has(source.trim().toLowerCase()));
}

export function createUploadAlerts({ send, now = Date.now, log = console.error }) {
  let lastUploadAt = now();
  let adTrafficSince = null;
  let lastAdVisitAt = null;
  let silenceNotified = false;
  let pendingFailure = null;
  let nextFailureAt = 0;
  let nextDeliveryAttemptAt = 0;
  let delivery = null;

  function check() {
    if (delivery) return delivery;
    const time = now();
    if (time < nextDeliveryAttemptAt) return;

    const failure = pendingFailure;
    const lastUpload = lastUploadAt;
    const windowStart = time - NO_UPLOAD_WINDOW;
    const hasUploadGap = !silenceNotified && lastUpload <= windowStart
      && adTrafficSince !== null && adTrafficSince <= windowStart && lastAdVisitAt >= windowStart;
    if (!failure && !hasUploadGap) return;

    const message = failure
      ? `Word2you · ${moscowTime.format(failure.time)} МСК\n${failure.label}: серверная ошибка загрузки фото (HTTP ${failure.status}).`
      : "Word2you · За последние 3 часа были заходы из рекламы, успешных загрузок фото — 0.";

    delivery = Promise.resolve().then(() => send(message)).then(() => {
      if (failure) {
        pendingFailure = null;
        nextFailureAt = now() + SERVER_ERROR_COOLDOWN;
      } else if (lastUploadAt === lastUpload) {
        silenceNotified = true;
      }
    }, () => {
      nextDeliveryAttemptAt = now() + MINUTE;
      log("[upload-alerts] Telegram delivery failed");
    }).finally(() => {
      delivery = null;
      if (!failure && pendingFailure) void check();
    });
    return delivery;
  }

  function middleware(req, res, next) {
    const upload = uploadRequest(req.method, req.path);
    const adLanding = isAdLanding(req);
    if (upload || adLanding) {
      res.once("finish", () => {
        const time = now();
        const status = res.statusCode;
        const success = status >= 200 && status < 300;
        if (adLanding && (success || status === 304)) {
          if (lastAdVisitAt === null || time - lastAdVisitAt > NO_UPLOAD_WINDOW) adTrafficSince = time;
          lastAdVisitAt = time;
        }
        if (upload?.savesFile && success) {
          lastUploadAt = time;
          silenceNotified = false;
        }
        if (upload && status >= 500 && status < 600 && time >= nextFailureAt && !pendingFailure) {
          pendingFailure = { time, label: upload.label, status };
          void check();
        }
      });
    }
    return next();
  }

  function start() {
    const timer = setInterval(check, MINUTE);
    timer.unref();
    return timer;
  }

  return { middleware, check, start };
}
