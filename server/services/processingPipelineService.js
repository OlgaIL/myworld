import {
  OPENAI_MODEL,
  PROCESSING_FREE_MODE,
  PROCESSING_GUEST_MODE,
  PROCESSING_MODE_OVERRIDE,
  PROCESSING_PAID_MODE,
  PROCESSING_STANDARD_AI_PROVIDER,
  PROCESSING_STANDARD_OCR_PROVIDER,
  YANDEX_GPT_MODEL_URI,
  YANDEX_OCR_LANGUAGE_CODES,
  YANDEX_OCR_MODEL
} from "../config/env.js";
import { OPENAI_API_KEY, YANDEX_API_KEY, YANDEX_FOLDER_ID } from "../config/private-env.js";
import * as aiService from "./aiService.js";
import ocrService from "./ocrService.js";

export const PROCESSING_PIPELINES = {
  FAST: "fast",
  STANDARD: "standard"
};

const STANDARD_OCR_PROVIDERS = new Set(["google", "yandex"]);
const STANDARD_AI_PROVIDERS = new Set(["openai", "yandex"]);

function hasActiveExtendedAccess(user) {
  const accessExpiresAt = user?.accessExpiresAt ?? user?.access_expires_at ?? null;
  const expiresAtTime = accessExpiresAt ? new Date(accessExpiresAt).getTime() : 0;
  return Boolean(expiresAtTime && expiresAtTime > Date.now());
}

function hasUnlimitedAccess(user) {
  return Boolean(user?.processingEnabled ?? user?.processing_enabled);
}

function isKnownPipeline(mode) {
  return mode === PROCESSING_PIPELINES.FAST || mode === PROCESSING_PIPELINES.STANDARD;
}

function normalizePipeline(mode, fallback) {
  return isKnownPipeline(mode) ? mode : fallback;
}

function normalizeProvider(provider, allowedProviders, fallback) {
  return allowedProviders.has(provider) ? provider : fallback;
}

function resolveAudienceMode(user, audience) {
  if (audience === "guest") {
    return normalizePipeline(PROCESSING_GUEST_MODE, PROCESSING_PIPELINES.FAST);
  }

  if (audience === "paid" || hasUnlimitedAccess(user) || hasActiveExtendedAccess(user)) {
    return normalizePipeline(PROCESSING_PAID_MODE, PROCESSING_PIPELINES.STANDARD);
  }

  if (audience === "free") {
    return normalizePipeline(PROCESSING_FREE_MODE, PROCESSING_PIPELINES.FAST);
  }

  if (!user) {
    return normalizePipeline(PROCESSING_GUEST_MODE, PROCESSING_PIPELINES.FAST);
  }

  return normalizePipeline(PROCESSING_FREE_MODE, PROCESSING_PIPELINES.FAST);
}

export function resolveProcessingPipeline(user = null, options = {}) {
  if (isKnownPipeline(PROCESSING_MODE_OVERRIDE)) {
    return PROCESSING_MODE_OVERRIDE;
  }

  const preferredMode = user?.processingMode ?? user?.processing_mode ?? null;

  if (isKnownPipeline(preferredMode)) {
    return preferredMode;
  }

  return resolveAudienceMode(user, options.audience);
}

export function getProcessingPipelineForUser(user = null, options = {}) {
  const pipeline = resolveProcessingPipeline(user, options);
  const ocrProvider = pipeline === PROCESSING_PIPELINES.STANDARD
    ? normalizeProvider(PROCESSING_STANDARD_OCR_PROVIDER, STANDARD_OCR_PROVIDERS, "yandex")
    : "openai";
  const aiProvider = pipeline === PROCESSING_PIPELINES.STANDARD
    ? normalizeProvider(PROCESSING_STANDARD_AI_PROVIDER, STANDARD_AI_PROVIDERS, "yandex")
    : "openai";

  return {
    pipeline,
    ocrProvider,
    aiProvider,
    ocrLanguageCodes: ocrProvider === "yandex" ? YANDEX_OCR_LANGUAGE_CODES : [],
    ocrModel: ocrProvider === "yandex" ? YANDEX_OCR_MODEL : ""
  };
}

export function getCurrentProcessingPipeline() {
  return getProcessingPipelineForUser(null, { audience: "guest" });
}

export function canProcessImageWithPipeline(pipeline) {
  return pipeline.pipeline === PROCESSING_PIPELINES.FAST && pipeline.aiProvider === "openai";
}

export async function processImageWithPipeline(imagePath, pipeline) {
  return aiService.processImage(imagePath, {
    provider: pipeline.aiProvider,
    openAiApiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL
  });
}

export async function recognizeWithPipeline(imagePath, pipeline) {
  return ocrService.recognize(imagePath, {
    provider: pipeline.ocrProvider,
    apiKey: YANDEX_API_KEY,
    folderId: YANDEX_FOLDER_ID,
    languageCodes: pipeline.ocrLanguageCodes,
    model: pipeline.ocrModel
  });
}

export async function enrichWithPipeline(text, pipeline) {
  return aiService.process(text, {
    provider: pipeline.aiProvider,
    apiKey: YANDEX_API_KEY,
    folderId: YANDEX_FOLDER_ID,
    modelUri: YANDEX_GPT_MODEL_URI,
    openAiApiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL
  });
}

export async function recognizeWithCurrentPipeline(imagePath) {
  return recognizeWithPipeline(imagePath, getCurrentProcessingPipeline());
}

export async function enrichWithCurrentPipeline(text) {
  return enrichWithPipeline(text, getCurrentProcessingPipeline());
}
