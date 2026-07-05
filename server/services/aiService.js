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
import { buildYandexSystemPrompt, buildYandexUserPrompt } from "./prompts/yandexPrompt.js";

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

async function processYandex(text, { apiKey, folderId, modelUri }) {
  if (!apiKey) {
    return errorResult("YANDEX_API_KEY is not set");
  }

  if (!folderId) {
    return errorResult("YANDEX_FOLDER_ID is not set");
  }

  const prompt = buildYandexUserPrompt(text);
  const resolvedModelUri = modelUri || `gpt://${folderId}/yandexgpt/latest`;

  try {
    const response = await axios.post(
      "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
      {
        modelUri: resolvedModelUri,
        completionOptions: {
          stream: false,
          temperature: 0.3,
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
    return parseAIResponse(rawText);
  } catch (error) {
    if (error.response) {
      console.error("YANDEX GPT API ERROR:", {
        status: error.response.status,
        data: JSON.stringify(error.response.data, null, 2)
      });
    } else {
      console.error("YANDEX GPT NETWORK ERROR:", error.message);
    }

    return errorResult("Yandex GPT failed");
  }
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
    return parseAIResponse(rawText);
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

function parseAIResponse(raw) {
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON found");
    }

    const jsonString = raw.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString);

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      category: normalizeCategory(parsed.category),
      section: normalizeSection(parsed.section),
      topic: normalizeTopic(parsed.topic),
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === "string").slice(0, 7) : [],
      ocrText: typeof parsed.ocrText === "string" ? parsed.ocrText : "",
      cleanText: typeof parsed.cleanText === "string" ? parsed.cleanText : "",
      textQuality: normalizeTextQuality(parsed.textQuality),
      notes: typeof parsed.notes === "string" ? parsed.notes : ""
    };
  } catch (error) {
    console.error("AI PARSE ERROR:", error.message);
    return errorResult("Invalid AI response");
  }
}

function errorResult(message) {
  return {
    title: "",
    summary: "",
    category: "",
    section: "",
    topic: "",
    tags: [],
    ocrText: "",
    cleanText: "",
    textQuality: "",
    notes: "",
    error: message
  };
}
