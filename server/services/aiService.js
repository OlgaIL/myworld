import fs from "fs";
import path from "path";
import axios from "axios";
import OpenAI from "openai";
import {
  AI_CATEGORIES,
  AI_SECTIONS,
  AI_TEXT_QUALITY_VALUES,
} from "./aiPrompt.js";
import {
  buildOpenAIImagePrompt as buildOpenAIImagePromptFromFile,
  buildOpenAIImageSystemPrompt,
  buildOpenAITextPrompt,
  buildOpenAITextSystemPrompt
} from "./prompts/openaiPrompt.js";
import {
  buildYandexSystemPrompt,
  buildYandexUserPrompt,
  YANDEX_CORRECTION_HINTS
} from "./prompts/yandexPrompt.js";
import {
  GENERIC_RECOGNITION_NOTE,
  normalizeTextCorrections
} from "../utils/textCorrections.js";

const IMAGE_MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function process(text, options) {
  const { provider } = options;

  if (provider === "yandex") {
    return processYandex(text, options);
  }

  if (provider === "openai") {
    return processOpenAI(text, options);
  }

  return errorResult("Unknown AI provider");
}

export async function processImage(imagePath, options) {
  const { provider } = options;

  if (provider !== "openai") {
    return errorResult("Image processing is only supported for OpenAI");
  }

  return processOpenAIImage(imagePath, options);
}

const YANDEX_RETRYABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ERR_NETWORK"
]);

export function isRetryableYandexError(error) {
  const status = Number(error?.response?.status || 0);
  return status === 429
    || status >= 500
    || (!error?.response && YANDEX_RETRYABLE_ERROR_CODES.has(String(error?.code || "")));
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function processYandex(text, { apiKey, folderId, modelUri, httpClient = axios, retryDelay = wait }) {
  if (!apiKey) {
    return errorResult("YANDEX_API_KEY is not set");
  }

  if (!folderId) {
    return errorResult("YANDEX_FOLDER_ID is not set");
  }

  const prompt = buildYandexUserPrompt(text);
  const resolvedModelUri = modelUri || `gpt://${folderId}/yandexgpt/latest`;

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await httpClient.post(
      "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
      {
        modelUri: resolvedModelUri,
        completionOptions: {
          stream: false,
          temperature: 0.2,
          maxTokens: 2000
        },
        messages: [
          {
            role: "system",
            text: buildYandexSystemPrompt()
          },
          {
            role: "user",
            text: prompt
          }
        ]
      },
      {
        headers: {
          Authorization: `Api-Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

      const rawText = response.data?.result?.alternatives?.[0]?.message?.text || "";
      return parseAIResponse(rawText, {
        sourceText: text,
        correctionHints: YANDEX_CORRECTION_HINTS
      });
    } catch (error) {
      const retryable = isRetryableYandexError(error);
      console.error("YANDEX GPT REQUEST ERROR:", {
        attempt,
        maxAttempts,
        retryable,
        status: Number(error?.response?.status || 0) || null,
        code: String(error?.code || "") || null,
        message: String(error?.message || "Yandex GPT request failed").slice(0, 200)
      });

      if (retryable && attempt < maxAttempts) {
        await retryDelay(500);
        continue;
      }

      return errorResult("Yandex GPT failed", {
        errorCode: "YANDEX_AI_UNAVAILABLE",
        retryable,
        attempts: attempt
      });
    }
  }

  return errorResult("Yandex GPT failed");
}

async function processOpenAI(text, { openAiApiKey, model = "gpt-4o-mini" }) {
  if (!openAiApiKey) {
    return errorResult("OPENAI_API_KEY is not set");
  }

  const prompt = buildOpenAITextPrompt(text);
  const client = new OpenAI({ apiKey: openAiApiKey });

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 2000,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: buildOpenAITextSystemPrompt()
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const rawText = response.choices?.[0]?.message?.content || "";
    return parseAIResponse(rawText, { sourceText: text });
  } catch (error) {
    if (error.status) {
      console.error("OPENAI API ERROR:", {
        status: error.status,
        message: error.message
      });
    } else {
      console.error("OPENAI NETWORK ERROR:", error.message);
    }

    return errorResult("OpenAI request failed");
  }
}

async function processOpenAIImage(imagePath, { openAiApiKey, model = "gpt-4o-mini" }) {
  if (!openAiApiKey) {
    return errorResult("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey: openAiApiKey });
  const imageUrl = buildImageDataUrl(imagePath);
  const prompt = buildOpenAIImagePromptFromFile();

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 2500,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: buildOpenAIImageSystemPrompt()
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ]
    });

    const rawText = response.choices?.[0]?.message?.content || "";
    return parseAIResponse(rawText);
  } catch (error) {
    if (error.status) {
      console.error("OPENAI IMAGE API ERROR:", {
        status: error.status,
        message: error.message
      });
    } else {
      console.error("OPENAI IMAGE NETWORK ERROR:", error.message);
    }

    return errorResult("OpenAI image request failed");
  }
}

function buildImageDataUrl(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[ext] || "image/jpeg";
  const base64 = fs.readFileSync(imagePath).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

const ALLOWED_CATEGORIES = new Set(AI_CATEGORIES);
const ALLOWED_SECTIONS = new Set(AI_SECTIONS);
const ALLOWED_TEXT_QUALITY = new Set(AI_TEXT_QUALITY_VALUES);
const ALLOWED_FORMATTED_BLOCK_TYPES = new Set(["heading", "paragraph", "list"]);

function buildFallbackFormattedContent(text) {
  const blocks = String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ type: "paragraph", text: part }));

  return { blocks };
}

function normalizeFormattedBlockText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeListBlock(block) {
  const items = Array.isArray(block.items)
    ? block.items
      .filter((item) => typeof item === "string" && item.trim())
      .map(normalizeFormattedBlockText)
      .filter(Boolean)
      .slice(0, 100)
    : [];

  if (items.length === 0) {
    return null;
  }

  const numberedItems = items.map((item) => item.match(/^(\d{1,3})[.)]\s+(.+)$/u));
  const hasSequentialMarkers = numberedItems.every(Boolean)
    && numberedItems.every((match, index) => (
      index === 0 || Number(match[1]) === Number(numberedItems[index - 1][1]) + 1
    ));
  const ordered = block.ordered === true || hasSequentialMarkers;
  const inferredStart = hasSequentialMarkers ? Number(numberedItems[0][1]) : 1;
  const explicitStart = Number.isInteger(block.start) && block.start > 0 ? block.start : 1;
  const start = block.ordered === true ? explicitStart : inferredStart;

  return {
    type: "list",
    items: ordered
      ? items.map((item, index) => numberedItems[index]?.[2] || item)
      : items,
    ...(ordered ? { ordered: true } : {}),
    ...(ordered && start !== 1 ? { start } : {})
  };
}

export function normalizeFormattedContent(value, fallbackText = "") {
  const blocks = Array.isArray(value?.blocks)
    ? value.blocks.flatMap((block) => {
      if (!block || !ALLOWED_FORMATTED_BLOCK_TYPES.has(block.type)) {
        return [];
      }

      if (block.type === "list") {
        const list = normalizeListBlock(block);
        return list ? [list] : [];
      }

      if (typeof block.text !== "string") {
        return [];
      }

      if (block.type === "paragraph") {
        return block.text
          .split(/\n\s*\n/)
          .map(normalizeFormattedBlockText)
          .filter(Boolean)
          .map((text) => ({ type: "paragraph", text }));
      }

      const text = normalizeFormattedBlockText(block.text);
      return text ? [{ type: block.type, text }] : [];
    }).slice(0, 100)
    : [];

  return blocks.length > 0 ? { blocks } : buildFallbackFormattedContent(fallbackText);
}

export function formattedContentToText(content) {
  return (content?.blocks || []).map((block) => {
    if (block.type === "list") {
      return block.items.map((item, index) => (
        block.ordered ? `${Number(block.start || 1) + index}. ${item}` : `- ${item}`
      )).join("\n");
    }

    return block.text || "";
  }).filter(Boolean).join("\n\n");
}

function normalizeCategory(value) {
  if (typeof value !== "string") {
    return "другое";
  }

  const category = value.trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(category) ? category : "другое";
}

function normalizeSection(value) {
  if (typeof value !== "string") {
    return "другое";
  }

  const section = value.trim().toLowerCase();
  return ALLOWED_SECTIONS.has(section) ? section : "другое";
}

function normalizeTopic(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().slice(0, 80);
}

function normalizeTextQuality(value) {
  if (typeof value !== "string") {
    return "low_confidence";
  }

  const textQuality = value.trim();
  return ALLOWED_TEXT_QUALITY.has(textQuality) ? textQuality : "low_confidence";
}

export function parseAIResponse(raw, { sourceText = "", correctionHints = [] } = {}) {
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON found");
    }

    const jsonString = raw.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString);
    const resolvedSourceText = sourceText || parsed.ocrText || "";
    const formattedContent = normalizeFormattedContent(parsed.formattedContent, parsed.cleanText);
    const cleanText = formattedContentToText(formattedContent);
    const textQuality = normalizeTextQuality(parsed.textQuality);
    const corrections = normalizeTextCorrections(
      [
        ...(Array.isArray(parsed.corrections) ? parsed.corrections : []),
        ...(Array.isArray(correctionHints) ? correctionHints : [])
      ],
      formattedContent,
      resolvedSourceText
    );

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      category: normalizeCategory(parsed.category),
      section: normalizeSection(parsed.section),
      topic: normalizeTopic(parsed.topic),
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === "string").slice(0, 7) : [],
      ocrText: typeof parsed.ocrText === "string" ? parsed.ocrText : "",
      cleanText,
      formattedContent,
      hasTable: parsed.hasTable === true,
      hasFormulas: parsed.hasFormulas === true,
      hasRecognitionErrors: parsed.hasRecognitionErrors === true
        || corrections.length > 0
        || textQuality === "low_confidence"
        || textQuality === "no_meaningful_text",
      textQuality,
      corrections,
      notes: corrections.length > 0
        ? GENERIC_RECOGNITION_NOTE
        : typeof parsed.notes === "string" ? parsed.notes : ""
    };
  } catch (error) {
    console.error("AI PARSE ERROR:", error.message);
    return errorResult("Invalid AI response");
  }
}

function errorResult(message, details = {}) {
  return {
    title: "",
    summary: "",
    category: "",
    section: "",
    topic: "",
    tags: [],
    ocrText: "",
    cleanText: "",
    formattedContent: { blocks: [] },
    hasTable: false,
    hasFormulas: false,
    hasRecognitionErrors: false,
    textQuality: "",
    corrections: [],
    notes: "",
    error: message,
    ...details
  };
}
