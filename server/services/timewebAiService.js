import OpenAI from "openai";
import { timewebConfigurationError } from "../config/timeweb.js";
import { AI_CATEGORIES, AI_SECTIONS, AI_TEXT_QUALITY_VALUES } from "./aiPrompt.js";
import { parseAIResponse, errorResult } from "./aiService.js";

const SAFE_TRANSPORT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "ENETUNREACH", "EHOSTUNREACH", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);
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

function normalizeClassification(value, allowed, field, normalizations) {
  const candidate = typeof value === "string" ? value.trim().toLowerCase().replaceAll("ё", "е") : "";
  const normalized = allowed.includes(candidate) ? candidate : "другое";
  if (value !== normalized) normalizations.push({ code: allowed.includes(candidate)
    ? "CLASSIFICATION_NORMALIZED" : "CLASSIFICATION_DEFAULTED", field });
  return normalized;
}

// Accept only lossless alternative list shapes; never filter out bad items.
function normalizeListShape(block, field, normalizations) {
  if (Object.keys(block).some((key) => !["type", "items", "text", "ordered", "start", "level"].includes(key))) return block;
  if (Array.isArray(block.items) && block.items.length
    && block.items.every((item) => item && typeof item === "object" && !Array.isArray(item)
      && Object.keys(item).length === 1 && typeof item.text === "string")) {
    normalizations.push({ code: "LIST_TEXT_OBJECTS", field: `${field}.items` });
    return { ...block, items: block.items.map((item) => item.text) };
  }
  // Without explicit item boundaries, keep all text as a paragraph rather than
  // inventing list items from wrapped lines or discarding the whole document.
  const text = block.items === undefined && typeof block.text === "string" ? block.text
    : typeof block.items === "string" && (block.text === undefined || block.text === block.items) ? block.items : null;
  if (text !== null && text.trim() && (block.level === undefined || block.level === 0)) {
    normalizations.push({ code: "LIST_TEXT_AS_PARAGRAPH", field });
    return { type: "paragraph", text };
  }
  return block;
}

// Validate document structure before the shared parser; classification may fall
// back to "other", but malformed or ambiguous document content must still fail.
export function validateTimewebJson(raw, normalizations = []) {
  let value;
  try { value = JSON.parse(raw); }
  catch { invalid("JSON_SYNTAX", "$"); }
  if (!value || Array.isArray(value) || typeof value !== "object") invalid("INVALID_TYPE", "$");
  for (const field of ["title", "summary", "topic", "textQuality", "notes"]) {
    if (typeof value[field] !== "string") invalid(value[field] === undefined ? "MISSING_FIELD" : "INVALID_TYPE", field);
  }
  if (!value.title.trim()) invalid("EMPTY_VALUE", "title");
  value.category = normalizeClassification(value.category, AI_CATEGORIES, "category", normalizations);
  value.section = normalizeClassification(value.section, AI_SECTIONS, "section", normalizations);
  if (!AI_TEXT_QUALITY_VALUES.includes(value.textQuality)) invalid("INVALID_VALUE", "textQuality");
  if (!Array.isArray(value.tags)) invalid(value.tags === undefined ? "MISSING_FIELD" : "INVALID_TYPE", "tags");
  if (value.tags.some((tag) => typeof tag !== "string")) invalid("INVALID_TYPE", "tags[]");
  for (const field of ["hasTable", "hasFormulas", "hasRecognitionErrors"]) {
    if (typeof value[field] !== "boolean") invalid(value[field] === undefined ? "MISSING_FIELD" : "INVALID_TYPE", field);
  }
  if (!Array.isArray(value.formattedContent?.blocks)) {
    invalid(value.formattedContent?.blocks === undefined ? "MISSING_FIELD" : "INVALID_TYPE", "formattedContent.blocks");
  }
  if (value.formattedContent.blocks.length > 100) invalid("TOO_MANY_BLOCKS", "formattedContent.blocks");
  // Correction metadata is normalized separately: a bad item must not discard
  // otherwise valid document text. Unusable/ambiguous replacements are hidden.
  let expandedBlockCount = 0;
  let previousListLevel = -1;
  for (const [index, originalBlock] of value.formattedContent.blocks.entries()) {
    const field = `formattedContent.blocks[${index}]`;
    const block = originalBlock?.type === "list" ? normalizeListShape(originalBlock, field, normalizations) : originalBlock;
    value.formattedContent.blocks[index] = block;
    if (!block || !["heading", "paragraph", "list"].includes(block.type)) invalid("INVALID_BLOCK_TYPE", `${field}.type`);
    if (block.type === "list") {
      const level = block.level === undefined ? 0 : block.level;
      if (!Number.isInteger(level) || level < 0 || level > 2) invalid("INVALID_LIST_LEVEL", `${field}.level`);
      if (level > previousListLevel + 1) invalid("ORPHAN_LIST_LEVEL", `${field}.level`);
      previousListLevel = level;
      if (block.ordered !== undefined && typeof block.ordered !== "boolean") invalid("INVALID_TYPE", `${field}.ordered`);
      if (block.start !== undefined && (!Number.isInteger(block.start) || block.start < 1)) invalid("INVALID_VALUE", `${field}.start`);
      if (block.text !== undefined && block.text !== "") invalid("AMBIGUOUS_LIST_CONTENT", `${field}.text`);
      if (!Array.isArray(block.items)) invalid("INVALID_TYPE", `${field}.items`);
      if (!block.items.length) invalid("EMPTY_VALUE", `${field}.items`);
      if (block.items.length > 100) invalid("TOO_MANY_ITEMS", `${field}.items`);
      for (const [itemIndex, item] of block.items.entries()) {
        if (typeof item !== "string") invalid("INVALID_TYPE", `${field}.items[${itemIndex}]`);
        if (!item.trim()) invalid("EMPTY_VALUE", `${field}.items[${itemIndex}]`);
      }
    } else {
      previousListLevel = -1;
      if (typeof block.text !== "string") invalid("INVALID_TYPE", `${field}.text`);
      if (!block.text.trim()) invalid("EMPTY_VALUE", `${field}.text`);
    }
    expandedBlockCount += block.type === "paragraph"
      ? block.text.split(/\n\s*\n/).filter((text) => text.trim()).length : 1;
  }
  if (expandedBlockCount > 100) invalid("TOO_MANY_BLOCKS", "formattedContent.blocks");
  if (!value.formattedContent.blocks.length && value.textQuality !== "no_meaningful_text") invalid("EMPTY_RESULT", "formattedContent.blocks");
  return value;
}

// Explicit mixed markers are evidence; semantic guesses about hierarchy are not.
// Keep a usable result with a visible warning rather than add a paid retry or
// silently rewrite the model's text. Never put the source or model text in logs.
export function hasChangedMixedListMarkers(sourceText, content) {
  const source = String(sourceText || "").split(/\r?\n/u);
  const numbers = source.map((line) => line.match(/^\s*(\d{1,3})(?:[.)]\s*|\s+)(\S.*)$/u))
    .filter(Boolean).map((match) => Number(match[1]));
  const bullets = source.filter((line) => /^\s*[•●▪*-]\s+\S/u.test(line)).length;
  if (!bullets || numbers.length < 2 || numbers.some((value, index) => index > 0 && value !== numbers[index - 1] + 1)) return false;
  const lists = (content?.blocks || []).filter((block) => block.type === "list");
  const orderedCount = lists.filter((block) => block.ordered).reduce((sum, block) => sum + block.items.length, 0);
  const bulletCount = lists.filter((block) => !block.ordered).reduce((sum, block) => sum + block.items.length, 0);
  return bulletCount < bullets || orderedCount !== numbers.length || orderedCount + bulletCount !== numbers.length + bullets;
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

export async function processTimeweb(text, { timeweb = {}, logger = console, onRawResponse = null, fetchImplementation = globalThis.fetch } = {}) {
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
  let transportCode;
  try {
    const client = new OpenAI({ apiKey: timeweb.apiKey, baseURL: timeweb.baseURL,
      timeout: timeweb.timeoutMs, maxRetries: 0, logLevel: "off",
      fetch: async (...args) => {
        try { return await fetchImplementation(...args); }
        catch (error) {
          const candidates = [error?.code, error?.cause?.code,
            ...(Array.isArray(error?.cause?.errors) ? error.cause.errors.map((item) => item?.code) : [])];
          transportCode = candidates.find((code) => SAFE_TRANSPORT_CODES.has(code));
          throw error;
        }
      } });
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
    const normalizations = [];
    let validated;
    try { validated = validateTimewebJson(raw, normalizations); } catch (error) {
      const diagnostics = error instanceof TimewebValidationError
        ? { validationReason: error.reason, field: error.field }
        : { validationReason: "VALIDATION_FAILED" };
      return fail("TIMEWEB_INVALID_JSON", { usage }, diagnostics);
    }
    // Only consume the validated blocks, never an unvalidated formattedText or
    // cleanText alias that could override them in the shared parser.
    const document = { ...validated };
    delete document.formattedText;
    delete document.cleanText;
    const result = parseAIResponse(JSON.stringify(document), { sourceText: text });
    if (result.error) return fail("TIMEWEB_INVALID_JSON", { usage }, { validationReason: "NORMALIZATION_FAILED" });
    if (hasChangedMixedListMarkers(text, result.formattedContent)) {
      result.hasRecognitionErrors = true;
      result.notes = [result.notes, "Проверьте список по фото: при обработке могли измениться маркеры или границы пунктов."].filter(Boolean).join(" ");
      normalizations.push({ code: "LIST_STRUCTURE_REQUIRES_REVIEW", field: "formattedContent.blocks" });
    }
    if (typeof onRawResponse === "function") onRawResponse(raw);
    if (normalizations.length) logger.warn?.("TIMEWEB LLM NORMALIZED:", JSON.stringify({ provider: "timeweb",
      timestamp: new Date().toISOString(), normalizations }));
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
    if (transportCode) diagnostics.transportCode = transportCode;
    if (timeout) diagnostics.timeoutStage = transportCode === "UND_ERR_CONNECT_TIMEOUT" ? "connect"
      : controller.signal.aborted ? "request_deadline" : "transport";
    return fail(code, { failureKind: timeout ? "timeout" : "error", usage }, diagnostics);
  } finally {
    clearTimeout(timer);
  }
}
