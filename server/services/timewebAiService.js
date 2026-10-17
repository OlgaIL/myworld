import OpenAI from "openai";
import { timewebConfigurationError } from "../config/timeweb.js";
import { AI_CATEGORIES, AI_SECTIONS, AI_TEXT_QUALITY_VALUES } from "./aiPrompt.js";
import { parseAIResponse, errorResult } from "./aiService.js";
import { buildTimewebTextPrompt, buildTimewebTextSystemPrompt } from "./prompts/timewebPrompt.js";

class TimewebValidationError extends Error {
  constructor(reason, field) {
    super("Invalid Timeweb response");
    this.reason = reason;
    this.field = field;
  }
}

function invalid(reason, field) {
  throw new TimewebValidationError(reason, field);
}

// Check the full prompt contract before the existing tolerant normalizing parser.
export function validateTimewebJson(raw) {
  let value;
  try { value = JSON.parse(raw); }
  catch { invalid("JSON_SYNTAX", "$"); }
  if (!value || Array.isArray(value) || typeof value !== "object") invalid("INVALID_TYPE", "$");
  for (const field of ["title", "summary", "category", "section", "topic", "textQuality", "notes"]) {
    if (typeof value[field] !== "string") invalid(value[field] === undefined ? "MISSING_FIELD" : "INVALID_TYPE", field);
  }
  if (!value.title.trim()) invalid("EMPTY_VALUE", "title");
  for (const [field, allowed] of [["category", AI_CATEGORIES], ["section", AI_SECTIONS], ["textQuality", AI_TEXT_QUALITY_VALUES]]) {
    if (!allowed.includes(value[field])) invalid("INVALID_VALUE", field);
  }
  if (!Array.isArray(value.tags)) invalid(value.tags === undefined ? "MISSING_FIELD" : "INVALID_TYPE", "tags");
  if (value.tags.some((tag) => typeof tag !== "string")) invalid("INVALID_TYPE", "tags[]");
  for (const field of ["hasTable", "hasFormulas", "hasRecognitionErrors"]) {
    if (typeof value[field] !== "boolean") invalid(value[field] === undefined ? "MISSING_FIELD" : "INVALID_TYPE", field);
  }
  if (!Array.isArray(value.formattedContent?.blocks)) {
    invalid(value.formattedContent?.blocks === undefined ? "MISSING_FIELD" : "INVALID_TYPE", "formattedContent.blocks");
  }
  // Correction metadata is normalized separately: a bad item must not discard
  // otherwise valid document text. Unusable/ambiguous replacements are hidden.
  for (const [index, block] of value.formattedContent.blocks.entries()) {
    const field = `formattedContent.blocks[${index}]`;
    if (!block || !["heading", "paragraph", "list"].includes(block.type)) invalid("INVALID_BLOCK_TYPE", `${field}.type`);
    if (block.type === "list") {
      if (!Array.isArray(block.items)) invalid("INVALID_TYPE", `${field}.items`);
      if (!block.items.length) invalid("EMPTY_VALUE", `${field}.items`);
      for (const [itemIndex, item] of block.items.entries()) {
        if (typeof item !== "string") invalid("INVALID_TYPE", `${field}.items[${itemIndex}]`);
        if (!item.trim()) invalid("EMPTY_VALUE", `${field}.items[${itemIndex}]`);
      }
    } else {
      if (typeof block.text !== "string") invalid("INVALID_TYPE", `${field}.text`);
      if (!block.text.trim()) invalid("EMPTY_VALUE", `${field}.text`);
    }
  }
  if (!value.formattedContent.blocks.length && value.textQuality !== "no_meaningful_text") invalid("EMPTY_RESULT", "formattedContent.blocks");
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
  const startedAt = Date.now();
  const fail = (code, details = {}, diagnostics = {}) => {
    // One searchable line. Only fixed reasons/field paths and numeric metadata;
    // never include response values, parser messages, headers or upstream bodies.
    logger.error?.("TIMEWEB LLM ERROR:", JSON.stringify({ provider: "timeweb", code,
      timestamp: new Date().toISOString(), durationMs: Math.max(0, Date.now() - startedAt),
      ...diagnostics, usage: details.usage || {} }));
    return errorResult(`Timeweb: ${code}`, { errorCode: code, failureKind: "error", attempts: 1, sourceText: text, ...details });
  };
  const configError = timewebConfigurationError(timeweb);
  if (configError) return fail(configError, { attempts: 0 });
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
    try { validateTimewebJson(raw); } catch (error) {
      const diagnostics = error instanceof TimewebValidationError
        ? { validationReason: error.reason, field: error.field }
        : { validationReason: "VALIDATION_FAILED" };
      return fail("TIMEWEB_INVALID_JSON", { usage }, diagnostics);
    }
    const result = parseAIResponse(raw, { sourceText: text });
    if (result.error) return fail("TIMEWEB_INVALID_JSON", { usage }, { validationReason: "NORMALIZATION_FAILED" });
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
    const diagnostics = Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {};
    return fail(code, { failureKind: timeout ? "timeout" : "error", usage }, diagnostics);
  } finally {
    clearTimeout(timer);
  }
}
