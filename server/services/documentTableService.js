import fs from "node:fs/promises";
import OpenAI from "openai";
import vision from "@google-cloud/vision";
import { managedFile } from "./guestStorageFiles.js";
import { getTimewebOptions } from "./processingPipelineService.js";
import { timewebConfigurationError } from "../config/timeweb.js";

const MAX_TABLES = 10;
const MAX_ROWS = 100;
const MAX_COLUMNS = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `Ты извлекаешь таблицы с фотографии документа. Верни только JSON вида {"tables":[{"title":"...","headers":["..."],"rows":[["..."]]}]}.
Сохраняй ориентацию фотографии: заголовки сверху идут слева направо, названия строк слева идут сверху вниз. Никогда не меняй строки и столбцы местами. Извлеки ВСЕ видимые таблицы в порядке сверху вниз, включая таблицы в нижней части фотографии.
Копируй каждую ячейку буквально: числа, запятые, прочерки, пустые ячейки. Не исправляй исходные числа по суммам, не придумывай пропущенные значения. Первая ячейка каждой строки — название строки. Сохраняй одинаковую длину строк и заголовков. Если надёжно восстановить таблицу нельзя, верни {"tables":[]}.`;

function compact(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е").replace(/[^\p{L}\p{N}]/gu, "");
}

function cellKey(value) {
  const first = String(value || "").trim().split(/\s+/u)[0];
  return compact(first);
}

function isBlank(value) {
  return !compact(value);
}

export function validateTablePayload(raw) {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!value || !Array.isArray(value.tables) || value.tables.length > MAX_TABLES) {
    throw new Error("TABLE_INVALID_STRUCTURE");
  }
  const tables = value.tables.map((table) => {
    const headers = table?.headers;
    const rows = table?.rows;
    if (typeof table?.title !== "string" || table.title.length > 300
      || !Array.isArray(headers) || headers.length < 2 || headers.length > MAX_COLUMNS
      || !Array.isArray(rows) || rows.length < 2 || rows.length > MAX_ROWS
      || headers.some((cell) => typeof cell !== "string" || cell.length > 300)
      || rows.some((row) => !Array.isArray(row) || row.length !== headers.length
        || row.some((cell) => typeof cell !== "string" || cell.length > 300))
      || headers.slice(1).filter((cell) => !isBlank(cell)).length < 1
      || rows.some((row) => isBlank(row[0]))) {
      throw new Error("TABLE_INVALID_STRUCTURE");
    }
    return { title: table.title.trim(), headers: headers.map((cell) => cell.trim()),
      rows: rows.map((row) => row.map((cell) => cell.trim())) };
  });
  return tables;
}

function ocrWords(annotations) {
  if (!Array.isArray(annotations)) return [];
  return annotations.slice(1).map((entry) => {
    const vertices = entry?.boundingPoly?.vertices;
    if (!Array.isArray(vertices) || !vertices.length) return null;
    const xs = vertices.map((point) => Number(point?.x || 0));
    const ys = vertices.map((point) => Number(point?.y || 0));
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const key = compact(entry.description);
    if (!key || ![left, right, top, bottom].every(Number.isFinite) || bottom <= top) return null;
    return { key, left, right, x: (left + right) / 2, y: (top + bottom) / 2, height: bottom - top };
  }).filter(Boolean).sort((a, b) => a.y - b.y || a.left - b.left);
}

function toLines(words) {
  const lines = [];
  for (const word of words) {
    let target = lines.find((line) => Math.abs(line.y - word.y) <= Math.max(line.height, word.height) * 0.65);
    if (!target) {
      target = { y: word.y, height: word.height, words: [] };
      lines.push(target);
    }
    target.words.push(word);
    target.y = target.words.reduce((sum, item) => sum + item.y, 0) / target.words.length;
    target.height = target.words.reduce((sum, item) => sum + item.height, 0) / target.words.length;
  }
  return lines.sort((a, b) => a.y - b.y).map((line) => ({ ...line,
    words: line.words.sort((a, b) => a.left - b.left) }));
}

function matchesOnLine(line, key) {
  const result = [];
  if (!key) return result;
  for (let start = 0; start < line.words.length; start++) {
    let combined = "";
    for (let end = start; end < Math.min(start + 5, line.words.length); end++) {
      combined += line.words[end].key;
      if (combined === key) {
        result.push({ x: (line.words[start].left + line.words[end].right) / 2, y: line.y });
        break;
      }
      if (!key.startsWith(combined)) break;
    }
  }
  return result;
}

function matchRow(line, row) {
  const label = matchesOnLine(line, cellKey(row[0]))[0];
  if (!label) return null;
  const positions = [label.x];
  let lastX = label.x;
  let checked = 0;
  for (const cell of row.slice(1)) {
    if (isBlank(cell)) {
      positions.push(null);
      continue;
    }
    const key = compact(cell);
    const position = matchesOnLine(line, key).find((item) => item.x > lastX);
    if (!position) return null;
    positions.push(position.x);
    lastX = position.x;
    checked++;
  }
  return checked > 0 ? positions : null;
}

function matchHeaders(lines, headers, beforeY, afterY) {
  const keys = headers.map(cellKey);
  for (const line of lines) {
    if (line.y <= afterY || line.y >= beforeY) continue;
    let lastX = -Infinity;
    let found = 0;
    for (const key of keys) {
      if (!key) continue;
      const position = matchesOnLine(line, key).find((item) => item.x > lastX);
      if (position) { found++; lastX = position.x; }
    }
    if (found >= 2) return true;
  }
  return false;
}

// Independent OCR coordinates verify that model rows run down the page and
// columns run left to right. A transpose fails even when sums still add up.
export function validateTableLayout(tables, annotations) {
  const lines = toLines(ocrWords(annotations));
  if (lines.length < 3) return { valid: false, reason: "NO_OCR_LAYOUT" };
  let afterY = -Infinity;
  for (const table of tables) {
    let firstY = null;
    let lastY = afterY;
    const columnXs = table.headers.map(() => []);
    for (const row of table.rows) {
      const candidate = lines.find((line) => line.y > lastY && matchRow(line, row));
      if (!candidate) return { valid: false, reason: "ROW_LAYOUT_MISMATCH" };
      const positions = matchRow(candidate, row);
      positions.forEach((x, index) => { if (x !== null) columnXs[index].push(x); });
      firstY ??= candidate.y;
      lastY = candidate.y;
    }
    if (!matchHeaders(lines, table.headers, firstY, afterY)) {
      return { valid: false, reason: "HEADER_LAYOUT_MISMATCH" };
    }
    // Repeated values must land in roughly the same vertical column.
    const centers = columnXs.map((positions) => positions.length
      ? positions.reduce((sum, x) => sum + x, 0) / positions.length : null);
    for (let index = 1; index < centers.length; index++) {
      if (centers[index] !== null && centers[index - 1] !== null
        && centers[index] <= centers[index - 1]) {
        return { valid: false, reason: "COLUMN_LAYOUT_MISMATCH" };
      }
    }
    afterY = lastY;
  }
  return { valid: true, reason: null };
}

export function tablesToContent(tables) {
  return { blocks: tables.flatMap((table) => [
    ...(table.title ? [{ type: "heading", text: table.title }] : []),
    { type: "table", headers: table.headers, rows: table.rows }
  ]) };
}

export function tableCaptionNumbers(sourceText) {
  return [...new Set([...String(sourceText || "").matchAll(/(?:^|\n)\s*таблица\s*(\d{1,3})\b/gimu)]
    .map((match) => match[1]))];
}

export async function extractDocumentTables(photo, { config = getTimewebOptions(),
  ocrClient = new vision.ImageAnnotatorClient(), client = null } = {}) {
  const configError = timewebConfigurationError(config);
  if (configError) return { status: "error", code: configError };
  let imagePath;
  try { imagePath = await managedFile(photo.storage_path, ["legacy", "users"]); }
  catch { return { status: "error", code: "TABLE_IMAGE_MISSING" }; }
  const imageBuffer = await fs.readFile(imagePath);
  if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
    return { status: "error", code: "TABLE_IMAGE_INVALID" };
  }
  const mimeType = photo.mime_type;
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return { status: "error", code: "TABLE_IMAGE_INVALID" };
  }
  const imageUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const timeoutMs = Math.max(config.timeoutMs, 30000);
  const controller = new AbortController();
  let timeout;
  let modelStartedAt = null;
  const resultWithAttempt = (result) => modelStartedAt
    ? { ...result, modelStartedAt, modelDurationMs: Math.max(0, Date.now() - modelStartedAt.getTime()) }
    : result;
  try {
    const [ocrResult] = await ocrClient.textDetection(imagePath);
    if (ocrResult?.error || !ocrResult?.textAnnotations?.length) {
      return { status: "review", code: "TABLE_OCR_LAYOUT_UNAVAILABLE" };
    }
    const sourceText = String(photo.ocr_text || ocrResult.textAnnotations[0].description || "");
    const expectedCaptions = tableCaptionNumbers(ocrResult.textAnnotations[0].description || sourceText);
    const modelClient = client || new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL,
      timeout: timeoutMs, maxRetries: 0, logLevel: "off" });
    modelStartedAt = new Date();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await modelClient.chat.completions.create({
      model: config.model,
      temperature: 0,
      max_tokens: Math.max(config.maxTokens, 6000),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [
          { type: "text", text: `На фото найдены заголовки таблиц: ${expectedCaptions.join(", ") || "не определены"}. Извлеки все эти таблицы. Распознанный текст для сверки (до 16000 символов):\n${sourceText.slice(0, 16000)}` },
          { type: "image_url", image_url: { url: imageUrl } }
        ] }
      ]
    }, { signal: controller.signal });
    if (response.choices?.[0]?.finish_reason !== "stop") {
      return resultWithAttempt({ status: "review", code: "TABLE_RESPONSE_INCOMPLETE" });
    }
    let tables;
    try { tables = validateTablePayload(response.choices?.[0]?.message?.content); }
    catch { return resultWithAttempt({ status: "review", code: "TABLE_INVALID_STRUCTURE" }); }
    if (expectedCaptions.length > tables.length) {
      return resultWithAttempt({ status: "review", code: "TABLE_COUNT_MISMATCH" });
    }
    if (!tables.length) return resultWithAttempt({ status: "no_tables", code: null });
    const layout = validateTableLayout(tables, ocrResult.textAnnotations);
    if (!layout.valid) return resultWithAttempt({ status: "review", code: layout.reason });
    return resultWithAttempt({ status: "ready", code: null, content: tablesToContent(tables) });
  } catch (error) {
    const status = Number(error?.status || 0);
    const code = controller.signal.aborted ? "TABLE_TIMEOUT" : status === 429 ? "TABLE_PROVIDER_LIMIT"
      : status === 401 || status === 403 ? "TABLE_PROVIDER_AUTH"
        : error?.code === 8 ? "TABLE_OCR_LIMIT" : "TABLE_PROVIDER_UNAVAILABLE";
    return resultWithAttempt({ status: "error", code });
  } finally {
    clearTimeout(timeout);
  }
}
