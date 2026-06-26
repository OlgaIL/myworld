import axios from "axios";
import OpenAI from "openai";
import {
  AI_CATEGORIES,
  AI_SECTIONS,
  AI_SYSTEM_PROMPT,
  AI_TEXT_QUALITY_VALUES,
  buildPrompt
} from "./aiPrompt.js";

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

async function processYandex(text, { apiKey, folderId }) {
  if (!apiKey) {
    return errorResult("YANDEX_API_KEY is not set");
  }

  if (!folderId) {
    return errorResult("YANDEX_FOLDER_ID is not set");
  }

  const prompt = buildPrompt(text);

  try {
    const response = await axios.post(
      "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
      {
        modelUri: `gpt://${folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.3,
          maxTokens: 2000
        },
        messages: [
          {
            role: "system",
            text: AI_SYSTEM_PROMPT
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

  const prompt = buildPrompt(text);
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
          content: AI_SYSTEM_PROMPT
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
    cleanText: "",
    textQuality: "",
    notes: "",
    error: message
  };
}
