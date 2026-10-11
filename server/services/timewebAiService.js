import OpenAI from "openai";
import { timewebConfigurationError } from "../config/timeweb.js";
import { AI_CATEGORIES, AI_SECTIONS, AI_TEXT_QUALITY_VALUES } from "./aiPrompt.js";
import { parseAIResponse, errorResult } from "./aiService.js";
import { buildTimewebTextPrompt, buildTimewebTextSystemPrompt } from "./prompts/timewebPrompt.js";

// Check the full prompt contract before the existing tolerant normalizing parser.
export function validateTimewebJson(raw) {
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("invalid contract");
  for (const field of ["title", "summary", "category", "section", "topic", "textQuality", "notes"]) {
    if (typeof value[field] !== "string") throw new Error("invalid contract");
  }
  if (!value.title.trim() || !AI_CATEGORIES.includes(value.category) || !AI_SECTIONS.includes(value.section)
    || !AI_TEXT_QUALITY_VALUES.includes(value.textQuality) || !Array.isArray(value.tags)
    || value.tags.some((tag) => typeof tag !== "string")
    || ["hasTable", "hasFormulas", "hasRecognitionErrors"].some((field) => typeof value[field] !== "boolean")
    || !Array.isArray(value.formattedContent?.blocks)) throw new Error("invalid contract");
  // Correction metadata is normalized separately: a bad item must not discard
  // otherwise valid document text. Unusable/ambiguous replacements are hidden.
  for (const block of value.formattedContent.blocks) {
    if (!block || !["heading", "paragraph", "list"].includes(block.type)) throw new Error("invalid block");
    if (block.type === "list") {
      if (!Array.isArray(block.items) || !block.items.length
        || block.items.some((item) => typeof item !== "string" || !item.trim())) throw new Error("invalid list");
    } else if (typeof block.text !== "string" || !block.text.trim()) throw new Error("empty block");
  }
  if (!value.formattedContent.blocks.length && value.textQuality !== "no_meaningful_text") throw new Error("empty result");
  return value;
}

function safeUsage(usage = {}) {
  usage ||= {};
  const result = {};
  for (const field of ["prompt_tokens", "completion_tokens", "total_tokens", "cost"]) {
    if (typeof usage[field] === "number" && Number.isFinite(usage[field]) && usage[field] >= 0) result[field] = usage[field];
  }
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  if (typeof reasoning === "number" && Number.isFinite(reasoning) && reasoning >= 0) result.reasoning_tokens = reasoning;
  return result;
}

export async function processTimeweb(text, { timeweb = {}, logger = console, onRawResponse = null } = {}) {
  const fail = (code, details = {}) => {
    logger.error?.("TIMEWEB LLM ERROR:", { provider: "timeweb", code, usage: details.usage || {} });
    return errorResult(`Timeweb: ${code}`, { errorCode: code, failureKind: "error", attempts: 1, sourceText: text, ...details });
  };
  const configError = timewebConfigurationError(timeweb);
  if (configError) return fail(configError, { attempts: 0 });
  const startedAt = Date.now();
  // Bound the entire completion, including a stalled response body after headers.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeweb.timeoutMs);
  let usage = {};
  try {
    const client = new OpenAI({ apiKey: timeweb.apiKey, baseURL: timeweb.baseURL,
      timeout: timeweb.timeoutMs, maxRetries: 0, logLevel: "off" });
    const response = await client.chat.completions.create({
      model: timeweb.model, temperature: 0.3, max_tokens: timeweb.maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: buildTimewebTextSystemPrompt() },
        { role: "user", content: buildTimewebTextPrompt(text) }]
    }, { signal: controller.signal });
    usage = safeUsage(response.usage);
    const choice = response.choices?.[0];
    const raw = choice?.message?.content;
    if (choice?.finish_reason === "length") return fail("TIMEWEB_RESPONSE_TRUNCATED", { usage });
    if (typeof raw !== "string" || !raw.trim()) return fail("TIMEWEB_RESPONSE_EMPTY", { usage });
    if (choice?.finish_reason !== "stop") return fail("TIMEWEB_RESPONSE_INCOMPLETE", { usage });
    try { validateTimewebJson(raw); } catch { return fail("TIMEWEB_INVALID_JSON", { usage }); }
    const result = parseAIResponse(raw, { sourceText: text });
    if (result.error) return fail("TIMEWEB_INVALID_JSON", { usage });
    if (typeof onRawResponse === "function") onRawResponse(raw);
    logger.info?.("TIMEWEB LLM SUCCESS:", { provider: "timeweb", model: timeweb.model, durationMs: Date.now() - startedAt, usage });
    return { ...result, sourceText: text, usage };
  } catch (error) {
    const status = Number(error?.status || 0);
    const timeout = controller.signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError;
    const code = timeout ? "TIMEWEB_TIMEOUT" : status === 401 || status === 403 ? "TIMEWEB_AUTH_ERROR"
      : status === 429 ? "TIMEWEB_LIMIT_ERROR" : status >= 500 ? "TIMEWEB_SERVICE_ERROR"
        : status ? "TIMEWEB_REQUEST_ERROR" : "TIMEWEB_NETWORK_ERROR";
    // Do not log upstream error bodies/messages, headers, keys or document text.
    return fail(code, { failureKind: timeout ? "timeout" : "error", usage });
  } finally {
    clearTimeout(timer);
  }
}
