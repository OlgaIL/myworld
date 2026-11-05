export const RECOGNIZED_STATUS = "recognized";
export const AI_UNAVAILABLE_MESSAGE = "Описание и оформление временно недоступны. Обработка не списана. Попробуйте повторить обработку.";
export const AI_CONNECTION_UNAVAILABLE_MESSAGE = "Текст распознан. Из-за проблем со связью описание и оформление временно недоступны. Обработка не списана. Повторите обработку немного позже.";

export function getAiUnavailableMessage(error) {
  const connectionFailure = typeof error === "string"
    && /^(?:Timeweb:\s*)?TIMEWEB_(?:NETWORK_ERROR|TIMEOUT)$/.test(error.trim());
  return connectionFailure ? AI_CONNECTION_UNAVAILABLE_MESSAGE : AI_UNAVAILABLE_MESSAGE;
}

export function buildRecognizedResult(text, error = "Yandex GPT failed") {
  return {
    status: RECOGNIZED_STATUS,
    ocrText: text,
    title: "Запись",
    summary: "",
    category: "",
    section: "",
    topic: "",
    tags: [],
    cleanText: text,
    formattedContent: { blocks: [] },
    hasTable: false,
    hasFormulas: false,
    hasRecognitionErrors: false,
    corrections: [],
    textQuality: "",
    aiNotes: getAiUnavailableMessage(error),
    errorMessage: error,
    processedAt: new Date()
  };
}

export function canRetryStoredEnrichment(document) {
  const text = String(document?.ocr_text || "").trim();
  if (text.length < 10) {
    return false;
  }

  return document.status === RECOGNIZED_STATUS
    || (document.status === "error" && document.error_message === "Yandex GPT failed");
}
