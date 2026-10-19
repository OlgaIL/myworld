export const SITE_ORIGIN = "https://word2you.ru";

// Shared by the build prerender, HTTP response and client-side navigation.
export const PUBLIC_PAGE_SEO = Object.freeze({
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
