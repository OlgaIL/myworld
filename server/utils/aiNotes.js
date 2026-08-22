export function formatAiNotesForDisplay(notes) {
  return String(notes || "")
    .replace(/^В тексте(?=\s|[.,!?])/, "В исходном тексте")
    .replace(/^Текст содержит(?=\s|[.,!?])/, "Исходный текст содержит")
    .replace(/\bOCR\b/g, "распознавания");
}
