import axios from "axios";
import OpenAI from "openai";

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
          maxTokens: 500
        },
        messages: [
          {
            role: "system",
            text: "Analyze OCR text from an image and return JSON only."
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
      max_tokens: 500,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: "You analyze OCR text from an image and return valid JSON only."
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

function buildPrompt(text) {
  return `
Analyze the OCR text and return JSON in this format:

{
  "title": "short title",
  "summary": "short summary",
  "tags": ["tag1", "tag2"]
}

Return only valid JSON.

OCR text:
${text}
`;
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
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === "string") : []
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
    tags: [],
    error: message
  };
}
