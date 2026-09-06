export const RECOGNIZED_STATUS = "recognized";
export const AI_UNAVAILABLE_MESSAGE = "Описание и оформление временно недоступны. Попробуйте повторить обработку.";

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
    textQuality: "",
    aiNotes: AI_UNAVAILABLE_MESSAGE,
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
