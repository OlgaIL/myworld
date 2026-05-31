export const GUEST_DOCUMENT_STATUS_META = {
  uploaded: {
    label: "Загружается",
    badgeClassName: "gallery__status-badge--processing",
    emptyText: "Текст еще обрабатывается.",
    ctaLabel: "Войти через Google",
    ctaHint: "После входа запись сохранится в вашем списке."
  },
  processing: {
    label: "Обработка",
    badgeClassName: "gallery__status-badge--processing",
    emptyText: "Текст еще обрабатывается.",
    ctaLabel: "Войти через Google",
    ctaHint: "После входа запись сохранится в вашем списке."
  },
  processed: {
    label: "✓ Текст найден",
    badgeClassName: "gallery__status-badge--processed",
    emptyText: "Текст не найден.",
    ctaLabel: "Войти и сохранить",
    ctaHint: "Текст найден. Войдите, чтобы увидеть текст целиком и сохранить запись."
  },
  no_text: {
    label: "Текст не найден",
    badgeClassName: "gallery__status-badge--warning",
    emptyText: "Текст не найден.",
    ctaLabel: "Загрузить другую запись",
    ctaHint: "Попробуйте загрузить другое фото или скан, где текст виден четче."
  },
  error: {
    label: "Ошибка",
    badgeClassName: "gallery__status-badge--error",
    emptyText: "Не получилось прочитать запись.",
    ctaLabel: "Загрузить другую запись",
    ctaHint: "Сервис временно недоступен. Попробуйте загрузить другое фото или повторите попытку чуть позже."
  },
  claimed: {
    label: "✓ Сохранено",
    badgeClassName: "gallery__status-badge--processed",
    emptyText: "Текст не найден.",
    ctaLabel: "Войти в кабинет",
    ctaHint: "Гостевая загрузка без входа уже использована. Запись сохранена в кабинете. Войдите, чтобы открыть ее или загрузить новые записи."
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

export const TEXT_QUALITY_META = {
  full_text: {
    label: "Цельный текст"
  },
  fragment: {
    label: "Фрагмент"
  },
  low_confidence: {
    label: "Нужно проверить"
  },
  no_meaningful_text: {
    label: "Нет понятного текста"
  }
};

export function getTextQualityMeta(textQuality) {
  return TEXT_QUALITY_META[textQuality] || null;
}
