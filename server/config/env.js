import "./load-env.js";

export const CLIENT_URL = process.env.CLIENT_URL;
export const SERVER_URL = process.env.SERVER_URL;
export const SESSION_SECRET = process.env.SESSION_SECRET || "keyboard cat";
export const AUTH_PROVIDERS = (process.env.AUTH_PROVIDERS || "google,yandex")
  .split(",")
  .map((provider) => provider.trim().toLowerCase())
  .filter(Boolean);

function readOptionalBoolean(value) {
  if (value === undefined || value === "") {
    return null;
  }

  return String(value).toLowerCase() === "true";
}

const AUTH_PROVIDER_FLAGS = {
  google: readOptionalBoolean(process.env.GOOGLE_AUTH_ENABLED),
  yandex: readOptionalBoolean(process.env.YANDEX_AUTH_ENABLED),
  vk: readOptionalBoolean(process.env.VK_AUTH_ENABLED),
  sber: readOptionalBoolean(process.env.SBER_AUTH_ENABLED),
  mts: readOptionalBoolean(process.env.MTS_AUTH_ENABLED)
};

export const OCR_PROVIDER = process.env.OCR_PROVIDER || "google";
export const AI_PROVIDER = process.env.AI_PROVIDER || "openai";
export const PROCESSING_MODE_OVERRIDE = (process.env.PROCESSING_MODE_OVERRIDE || "auto").toLowerCase();
export const PROCESSING_GUEST_MODE = (process.env.PROCESSING_GUEST_MODE || "fast").toLowerCase();
export const PROCESSING_FREE_MODE = (process.env.PROCESSING_FREE_MODE || "fast").toLowerCase();
export const PROCESSING_PAID_MODE = (process.env.PROCESSING_PAID_MODE || "standard").toLowerCase();
export const PROCESSING_STANDARD_OCR_PROVIDER = (process.env.PROCESSING_STANDARD_OCR_PROVIDER || "yandex").toLowerCase();
export const PROCESSING_STANDARD_AI_PROVIDER = (process.env.PROCESSING_STANDARD_AI_PROVIDER || "yandex").toLowerCase();
export const PROCESSING_GUEST_OCR_PROVIDER = (process.env.PROCESSING_GUEST_OCR_PROVIDER || PROCESSING_STANDARD_OCR_PROVIDER).toLowerCase();
export const PROCESSING_GUEST_AI_PROVIDER = (process.env.PROCESSING_GUEST_AI_PROVIDER || PROCESSING_STANDARD_AI_PROVIDER).toLowerCase();
export const PROCESSING_FREE_OCR_PROVIDER = (process.env.PROCESSING_FREE_OCR_PROVIDER || PROCESSING_STANDARD_OCR_PROVIDER).toLowerCase();
export const PROCESSING_FREE_AI_PROVIDER = (process.env.PROCESSING_FREE_AI_PROVIDER || PROCESSING_STANDARD_AI_PROVIDER).toLowerCase();
export const PROCESSING_PAID_OCR_PROVIDER = (process.env.PROCESSING_PAID_OCR_PROVIDER || PROCESSING_STANDARD_OCR_PROVIDER).toLowerCase();
export const PROCESSING_PAID_AI_PROVIDER = (process.env.PROCESSING_PAID_AI_PROVIDER || PROCESSING_STANDARD_AI_PROVIDER).toLowerCase();

export const PROCESSING_ENABLED = process.env.PROCESSING_ENABLED !== "false";
export const GOOGLE_OCR_ENABLED = process.env.GOOGLE_OCR_ENABLED !== "false";
export const YANDEX_OCR_ENABLED = process.env.YANDEX_OCR_ENABLED !== "false";
export const YANDEX_AI_ENABLED = process.env.YANDEX_AI_ENABLED !== "false";
export const OPENAI_ENABLED = process.env.OPENAI_ENABLED !== "false";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const YANDEX_GPT_MODEL_URI = process.env.YANDEX_GPT_MODEL_URI || "";
export const YANDEX_OCR_LANGUAGE_CODES = (process.env.YANDEX_OCR_LANGUAGE_CODES || "*")
  .split(",")
  .map((code) => code.trim())
  .filter(Boolean);
export const YANDEX_OCR_MODEL = process.env.YANDEX_OCR_MODEL || "";
export const GUEST_DOCUMENT_LIMIT = Number(process.env.GUEST_DOCUMENT_LIMIT || 5);
export const USER_RECORD_LIMIT = Number(process.env.USER_RECORD_LIMIT || 100);
export const GUEST_DOCUMENT_TTL_HOURS = Number(process.env.GUEST_DOCUMENT_TTL_HOURS || 24);
export const ADMIN_ENABLED = process.env.ADMIN_ENABLED === "true";
export const ADMIN_LOGIN = process.env.ADMIN_LOGIN || "";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const PROCESSING_ALLOWLIST_EMAILS = (process.env.PROCESSING_ALLOWLIST_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAuthProviderEnabled(provider) {
  const providerId = String(provider || "").toLowerCase();
  const explicitFlag = AUTH_PROVIDER_FLAGS[providerId];

  return explicitFlag === null || explicitFlag === undefined
    ? AUTH_PROVIDERS.includes(providerId)
    : explicitFlag;
}
