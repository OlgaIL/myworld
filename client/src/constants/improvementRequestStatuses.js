export const IMPROVEMENT_REQUEST_STATUS_META = {
  submitted: {
    label: "Запрос на улучшение отправлен",
    cardLabel: "Улучшение запрошено",
    details: "Обычно проверяем в течение нескольких часов, в сложных случаях — до 2 рабочих дней.",
    tone: "pending"
  },
  in_review: {
    label: "Проверяем результат",
    cardLabel: "Проверяем улучшение",
    details: "Запрос уже взят в работу.",
    tone: "pending"
  },
  improved: {
    label: "Улучшенная версия готова",
    cardLabel: "Улучшение готово",
    details: "Откройте документ повторно, чтобы увидеть обновлённый результат.",
    tone: "success"
  },
  not_improvable: {
    label: "Не удалось улучшить результат",
    cardLabel: "Улучшить не удалось",
    details: "Исходная версия документа сохранена.",
    tone: "neutral"
  },
  cancelled: {
    label: "Запрос отменён",
    cardLabel: "Запрос отменён",
    details: "Можно отправить новый запрос.",
    tone: "neutral"
  }
};

export function getImprovementRequestStatusMeta(status) {
  return IMPROVEMENT_REQUEST_STATUS_META[status] || null;
}

export function getLatestImprovementRequest(requests) {
  return Array.isArray(requests) && requests.length > 0 ? requests[0] : null;
}
