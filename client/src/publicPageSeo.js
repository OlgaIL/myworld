export const SITE_ORIGIN = "https://word2you.ru";

// Shared by the build prerender, HTTP response and client-side navigation.
export const PUBLIC_PAGE_SEO = Object.freeze({
  "/about": {
    title: "О Word2you — текст с фото и личный архив записей",
    description: "Возможности Word2you: печатный и рукописный текст с фото, несколько фотографий, таблицы и личный архив. Начните на телефоне, продолжите на компьютере.",
    file: "about.html"
  },
  "/batch-photo-to-text": {
    title: "Распознать текст с нескольких фото — Word2you",
    description: "После входа загрузите несколько фото страниц за один раз. Каждое изображение обрабатывается по очереди и сохраняется отдельной записью с текстом и исходным фото.",
    file: "batch-photo-to-text.html"
  },
  "/table-from-photo": {
    title: "Распознать таблицу с фото и скопировать в Word — Word2you",
    description: "Попробуйте восстановить строки и столбцы таблицы с фотографии. После входа проверьте ячейки по оригиналу и скопируйте результат в Word.",
    file: "table-from-photo.html"
  },
  "/": {
    title: "Фото записи в текст и личный архив — Word2you",
    description: "Загрузите фото записи, получите аккуратно оформленный текст и сохраните его в личном архиве. До 5 обработок без регистрации.",
    file: "home.html"
  },
  "/photo-to-text": {
    title: "Скопировать текст с фото онлайн — Word2you",
    description: "Распознайте текст с фото или скриншота и скопируйте результат. После входа — архив, пакетная загрузка фотографий и восстановление таблиц.",
    file: "photo-to-text.html"
  },
  "/handwriting-to-text": {
    title: "Распознать рукописный текст с фото онлайн — Word2you",
    description: "Распознайте рукописный текст, конспект или заметку с фотографии. Проверьте, улучшите и сохраните результат в личном архиве Word2you.",
    file: "handwriting-to-text.html"
  }
});
