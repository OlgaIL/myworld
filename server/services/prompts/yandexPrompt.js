import {
  AI_CATEGORIES,
  AI_SECTIONS,
  AI_TEXT_QUALITY_VALUES
} from "../aiPrompt.js";

export const YANDEX_CORRECTION_HINTS = Object.freeze([
  { original: "Евишня", replacement: "Евгения" },
  { original: "мсло", replacement: "масло" },
  { original: "контролъная", replacement: "контрольная" }
]);

export const YANDEX_RESPONSE_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "category",
    "section",
    "topic",
    "tags",
    "formattedContent",
    "hasTable",
    "hasFormulas",
    "hasRecognitionErrors",
    "textQuality",
    "corrections",
    "notes"
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    category: { type: "string", enum: AI_CATEGORIES },
    section: { type: "string", enum: AI_SECTIONS },
    topic: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" }
    },
    formattedContent: {
      type: "object",
      additionalProperties: false,
      required: ["blocks"],
      properties: {
        blocks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: {
              type: { type: "string", enum: ["heading", "paragraph", "list"] },
              text: { type: "string" },
              items: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        }
      }
    },
    hasTable: { type: "boolean" },
    hasFormulas: { type: "boolean" },
    hasRecognitionErrors: { type: "boolean" },
    textQuality: { type: "string", enum: AI_TEXT_QUALITY_VALUES },
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["original", "replacement"],
        properties: {
          original: { type: "string" },
          replacement: { type: "string" }
        }
      }
    },
    notes: { type: "string" }
  }
});

export function buildYandexSystemPrompt() {
  return `
Ты обрабатываешь только переданный OCR-текст и не видишь исходное изображение.
Верни полную, читаемую и структурированную запись без выдуманных сведений.

Содержание:
- Сохраняй все распознанные смысловые части и их входной порядок. Переставляй фрагменты только по явно переданным зонам, колонкам или порядку чтения.
- Исправляй склейки, разрывы слов, случайные переносы и очевидные ошибки распознавания только при надежном варианте.
- Примеры:
  - "Евишня" в списке людей или рядом с именами может быть "Евгения", если это ближе по смыслу и написанию.
  - "мсло" в рецепте может быть "масло".
  - "контролъная" может быть "контрольная".
- Если есть несколько правдоподобных вариантов, оставь OCR-фрагмент. Используй "[неразборчиво]" только при явном пропуске, маркере неразборчивости или низкой уверенности в OCR.
- Не добавляй отсутствующие факты, даты, суммы, имена, номера, подписи полей, выводы и недостающие части текста. Не заполняй пустые поля.
- Если исправляешь слово, имя, число или другой лексический фрагмент, сразу добавь в corrections точную пару original из OCR и replacement из formattedContent. Не включай изменения пробелов, регистра, пунктуации, переносов и структуры.

Структура formattedContent:
- Это полный восстановленный текст, а не пересказ.
- Используй heading только для явного заголовка, paragraph для абзаца, list для настоящего списка или последовательности.
- Не объединяй независимые зоны и колонки. Технические маркеры зон в результат не включай.
- В документах сохраняй шапку, реквизиты и существующие подписи полей. Не добавляй поясняющие названия полей, которых нет в OCR.
- Формулы, числа, знаки и обозначения сохраняй максимально близко к OCR; не решай задачи и не заменяй формулы пересказом.
- Не используй Markdown, HTML и сложную верстку.

Метаданные:
- title — короткое различимое название только по данным OCR.
- summary — описание в 1–2 предложениях без новых фактов.
- topic — короткая тема внутри section; tags — до 5 полезных тегов.
- hasTable = true только для таблицы или устойчивой сетки; hasFormulas = true только при наличии формул.
- textQuality: full_text — понятный цельный текст; fragment — часть большего текста; low_confidence — много сомнительных мест; no_meaningful_text — текст почти пустой или бессмысленный.
- hasRecognitionErrors = true при сомнительных или исправленных фрагментах.
- notes заполняй кратко только для неразборчивого, неполного текста, спорных формул или смешанных колонок; иначе верни пустую строку. Конкретные замены перечисляй только в corrections.

Верни только JSON, соответствующий заданной схеме.
`.trim();
}

export function buildYandexUserPrompt(text) {
  return `
Обработай OCR-текст по системным правилам.

OCR-текст:
${text}
`.trim();
}
