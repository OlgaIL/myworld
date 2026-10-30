const TEMPORARY = new Set(["TABLE_TIMEOUT", "TABLE_PROVIDER_LIMIT", "TABLE_PROVIDER_UNAVAILABLE"]);
const SOURCE = new Set(["TABLE_SOURCE_REUPLOAD_REQUIRED", "TABLE_SOURCE_CHANGED",
  "TABLE_IMAGE_MISSING", "TABLE_IMAGE_INVALID", "TABLE_OCR_LAYOUT_UNAVAILABLE"]);
const FORMAT = new Set(["JSON_SYNTAX", "ROOT_TYPE", "TABLES_TYPE", "TABLE_TYPE", "TITLE_TYPE",
  "HEADERS_TYPE", "ROWS_TYPE", "ROW_TYPE", "CELL_TYPE", "INVALID_ID", "INVALID_PART"]);
const LIMIT = new Set(["TABLE_LIMIT", "COLUMN_LIMIT", "ROW_LIMIT", "CELL_LENGTH", "TITLE_LENGTH"]);
const PLACEMENT = new Set(["TABLE_ANCHOR_MISMATCH", "TABLE_SOURCE_RANGE_MISMATCH"]);

// A failed check is evidence of a symptom, not proof of an illegible photo or
// a complex source table. Offer a paid retry only when a concrete change exists.
export function analyzeTableFailure(status, code, context = null, { pageInventory = false } = {}) {
  if (!["review", "error", "no_tables"].includes(status)) return { kind: null, action: null, retryable: false };
  if (TEMPORARY.has(code)) return { kind: "temporary", action: "retry_connection", retryable: true };
  if (SOURCE.has(code)) return { kind: "source", action: "reupload", retryable: false };
  if (pageInventory && ["TABLE_SOURCE_RANGE_MISMATCH","TABLE_GRID_COUNT_MISMATCH","TABLE_COUNT_MISMATCH"].includes(code)
    && ["initial","grid_split"].includes(context?.phase)&&context?.gridEvidence?.status==="detected") {
    return {kind:"grid",action:"inventory_page",retryable:true};
  }
  if (PLACEMENT.has(code)) return { kind: "placement", action: "review_placement", retryable: false };
  if (status === "error") return { kind: "service", action: "review_service", retryable: false };
  const diagnostic = context?.diagnostic;
  // Old count failures now have a different, concrete strategy available.
  // Once splitting was tried, another identical quality retry is not useful.
  if (["TABLE_GRID_COUNT_MISMATCH", "TABLE_COUNT_MISMATCH"].includes(code)
    && context?.phase === "initial" && context?.model?.startsWith("openai/")
    && context?.gridEvidence?.status === "detected"
    && context.gridEvidence.columns?.length >= 2 && context.gridEvidence.columns.length <= 4) {
    return { kind: "grid", action: "split_grid", retryable: true };
  }
  if (code === "TABLE_INVALID_STRUCTURE" && FORMAT.has(diagnostic?.reason)) {
    const repairable = context?.phase === "initial" && typeof context.model === "string"
      && context.model.startsWith("openai/");
    return { kind: "format", action: repairable ? "repair_format" : "review_format", retryable: repairable };
  }
  if (code === "TABLE_INVALID_STRUCTURE" && LIMIT.has(diagnostic?.reason)) {
    return { kind: "limit", action: "plan_split", retryable: false };
  }
  if (["ROW_LAYOUT_MISMATCH", "HEADER_LAYOUT_MISMATCH", "COLUMN_LAYOUT_MISMATCH",
    "CELL_VALUE_MISMATCH", "CELL_COLUMN_MISMATCH", "CELL_TEXT_MISSING", "TABLE_GRID_COLUMN_MISMATCH",
    "TABLE_GRID_COUNT_MISMATCH", "TABLE_GRID_ORDER_MISMATCH", "TABLE_GRID_HEADER_MISMATCH", "TABLE_GRID_ROW_AMBIGUOUS", "TABLE_GRID_ROW_MISMATCH",
    "TABLE_GRID_ROWS_MISSING", "TABLE_GRID_TOO_LARGE", "TABLE_COUNT_MISMATCH", "TABLE_RESPONSE_INCOMPLETE"].includes(code)
    || (code === "TABLE_INVALID_STRUCTURE" && diagnostic?.stage === "structure")) {
    return { kind: "grid", action: "review_grid", retryable: false };
  }
  // Old or unknown failures cannot authorize an identical paid request.
  return { kind: "quality", action: "review_response", retryable: false };
}

const FORMAT_HINTS = {
  JSON_SYNTAX: "Верни один синтаксически корректный JSON без Markdown и текста вокруг него.",
  ROOT_TYPE: "Корень JSON должен быть объектом с массивом tables.",
  TABLES_TYPE: "Поле tables должно быть массивом объектов таблиц.",
  TABLE_TYPE: "Каждый элемент tables должен быть объектом с title, headers и rows.",
  TITLE_TYPE: "Поле title должно быть строкой; при отсутствии названия используй пустую строку.",
  HEADERS_TYPE: "Поле headers должно быть массивом строк конечных колонок.",
  ROWS_TYPE: "Поле rows должно быть массивом строк таблицы, каждая строка — массив ячеек.",
  ROW_TYPE: "Каждая строка в rows должна быть массивом ячеек.",
  CELL_TYPE: 'Каждая ячейка должна быть строкой, включая числа. Пустая ячейка — "", не null.',
  INVALID_ID: "Не добавляй tableId: места вставки определит программа.",
  INVALID_PART: "Не добавляй tablePart: части таблиц определит программа."
};

// Only fixed instructions and a generated field path can enter the prompt.
// Never feed a rejected model answer back as an authoritative source of values.
export function tableRepairInstruction(diagnostic) {
  const hint = FORMAT_HINTS[diagnostic?.reason];
  if (!hint) return "";
  const field = /^(?:\$|tables(?:\[\d{1,3}\])?(?:\.(?:title|headers|rows|tableId|tablePart)(?:\[\d{1,3}\]){0,2})?)$/u
    .test(diagnostic.field || "") ? ` Поле предыдущего ответа: ${diagnostic.field}.` : "";
  return `Предыдущий ответ не прошёл проверку формата.${field} ${hint} Заново прочитай фото. Сохрани все числа, пустые клетки и колонки; не меняй данные ради формата.`;
}
