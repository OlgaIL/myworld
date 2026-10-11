import { buildOpenAITextPrompt, buildOpenAITextSystemPrompt } from "./openaiPrompt.js";

export function buildTimewebTextSystemPrompt() {
  const basePrompt = buildOpenAITextSystemPrompt().replace('  "notes": ""', '  "corrections": [],\n  "notes": ""');
  return `${basePrompt}

Дополнительное обязательное поле JSON: "corrections".
- Каждую фактическую лексическую замену запиши в corrections как пару original и replacement. Не пропускай исправленные слова, имена, числа или фрагменты, даже если исправление очевидно.
- original — точный фрагмент входного OCR-текста; replacement — точный фрагмент итогового formattedContent.
- Не включай изменения пробелов, регистра, пунктуации, переносов строк или структуры и предполагаемые замены, которых нет в итоговом тексте.
- Если замен нет, верни "corrections": [].
- Если замены есть, в notes верни только: "В исходном тексте присутствуют ошибки распознавания и опечатки." Сами замены перечисляй только в corrections.
Пример поля: "corrections": [{ "original": "мсло", "replacement": "масло" }].`;
}

export function buildTimewebTextPrompt(text) {
  return `${buildOpenAITextPrompt(text)}

Перед отправкой JSON сравни исходный текст с formattedContent и проверь полноту corrections. Обязательно верни этот массив, включая пустой, если лексических замен не было.`;
}
