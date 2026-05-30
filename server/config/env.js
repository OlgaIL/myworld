import "./load-env.js";

export const CLIENT_URL = process.env.CLIENT_URL;
export const SERVER_URL = process.env.SERVER_URL;
export const SESSION_SECRET = process.env.SESSION_SECRET || "keyboard cat";

export const OCR_PROVIDER = process.env.OCR_PROVIDER || "google";
export const AI_PROVIDER = process.env.AI_PROVIDER || "openai";

export const PROCESSING_ENABLED = process.env.PROCESSING_ENABLED !== "false";
export const GOOGLE_OCR_ENABLED = process.env.GOOGLE_OCR_ENABLED !== "false";
export const YANDEX_OCR_ENABLED = process.env.YANDEX_OCR_ENABLED !== "false";
export const YANDEX_AI_ENABLED = process.env.YANDEX_AI_ENABLED !== "false";
export const OPENAI_ENABLED = process.env.OPENAI_ENABLED !== "false";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
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
