export const GUEST_DOCUMENT_STATUS_META = {
  uploaded: {
    label: "Загружается",
    badgeClassName: "gallery__status-badge--processing",
    emptyText: "Текст еще обрабатывается.",
    ctaLabel: "Войти через Google",
    ctaHint: "После входа документ сохранится в вашем списке."
  },
  processing: {
    label: "Обработка",
    badgeClassName: "gallery__status-badge--processing",
    emptyText: "Текст еще обрабатывается.",
    ctaLabel: "Войти через Google",
    ctaHint: "После входа документ сохранится в вашем списке."
  },
  processed: {
    label: "Текст извлечен",
    badgeClassName: "gallery__status-badge--processed",
    emptyText: "Текст не найден.",
    ctaLabel: "Войти, чтобы получить описание",
    ctaHint: "Не потеряйте документ. Создайте аккаунт — и он всегда будет под рукой."
  },
  no_text: {
    label: "Текст не найден",
    badgeClassName: "gallery__status-badge--warning",
    emptyText: "Текст не найден.",
    ctaLabel: "Войти через Google",
    ctaHint: "После входа документ сохранится в вашем списке."
  },
  error: {
    label: "Ошибка OCR",
    badgeClassName: "gallery__status-badge--error",
    emptyText: "Не удалось прочитать текст.",
    ctaLabel: "Войти через Google",
    ctaHint: "После входа документ сохранится в вашем списке."
  },
  claimed: {
    label: "В аккаунте",
    badgeClassName: "gallery__status-badge--processed",
    emptyText: "Текст не найден.",
    ctaLabel: "Войти и открыть документ",
    ctaHint: "Этот документ уже сохранен в аккаунте. Войдите через Google, чтобы открыть его в списке."
  }
};

export function getGuestDocumentStatusMeta(status) {
  return GUEST_DOCUMENT_STATUS_META[status] || GUEST_DOCUMENT_STATUS_META.processed;
}

export const PHOTO_STATUS_META = {
  uploaded: {
    label: "Загружено",
    badgeClassName: "gallery__status-badge--uploaded"
  },
  processing: {
    label: "Обработка",
    badgeClassName: "gallery__status-badge--processing"
  },
  processed: {
    label: "✓ Текст загружен",
    badgeClassName: "gallery__status-badge--processed"
  },
  no_text: {
    label: "Текст не найден",
    badgeClassName: "gallery__status-badge--warning"
  },
  error: {
    label: "Ошибка",
    badgeClassName: "gallery__status-badge--error"
  }
};

export function getPhotoStatusMeta(status) {
  return PHOTO_STATUS_META[status] || null;
}
