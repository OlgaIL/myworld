import axios from "axios";

// === MAIN ENTRY ===
export async function process(text, options) {
  const { provider } = options;

  if (provider === "yandex") {
    return processYandex(text, options);
  }

  if (provider === "openai") {
    return processOpenAI(text, options);
  }

  return {
    title: "",
    summary: "",
    tags: [],
    error: "Unknown AI provider"
  };
}

// === YANDEX GPT ===
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
            text: "Ты анализируешь текст с изображения и возвращаешь JSON."
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

    const rawText =
      response.data?.result?.alternatives?.[0]?.message?.text || "";

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

// === OPENAI (fallback, можно оставить) ===
async function processOpenAI(text) {
  return {
    title: "",
    summary: "",
    tags: [],
    error: "OpenAI disabled"
  };
}

// === PROMPT ===
function buildPrompt(text) {
  return `
Проанализируй текст и верни JSON:

{
  "title": "короткий заголовок",
  "summary": "краткое описание",
  "tags": ["тег1", "тег2"]
}

Текст:
${text}
`;
}

// === PARSER ===
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
      title: parsed.title || "",
      summary: parsed.summary || "",
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };

  } catch (e) {
    console.error("AI PARSE ERROR:", e.message);

    return {
      title: "",
      summary: "",
      tags: [],
      error: "Invalid AI response"
    };
  }
}

// === ERROR RESULT ===
function errorResult(message) {
  return {
    title: "",
    summary: "",
    tags: [],
    error: message
  };
}