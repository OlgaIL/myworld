export const PAYMENT_PACKAGES = Object.freeze([
  Object.freeze({
    id: "start",
    title: "Старт",
    value: "20 обработок",
    price: "99 ₽",
    priceValue: 99,
    note: "Стартовая цена · доступно один раз",
    text: "Чтобы продолжить работу и проверить сервис на большем количестве фотографий.",
    action: "Оплатить 99 ₽"
  }),
  Object.freeze({
    id: "mini",
    title: "Мини",
    value: "50 обработок",
    price: "290 ₽",
    priceValue: 290,
    note: "5.8 ₽ за обработку",
    text: "Для небольшого архива: записи, чеки, фото документов и тексты на потом.",
    action: "Оплатить"
  }),
  Object.freeze({
    id: "standard",
    title: "Стандарт",
    value: "150 обработок",
    price: "590 ₽",
    priceValue: 590,
    note: "3.9 ₽ за обработку",
    text: "Хороший вариант, если нужно разобрать конспекты, заметки и накопившиеся фото текстов.",
    action: "Оплатить",
    featured: true,
    badge: "Хороший выбор"
  }),
  Object.freeze({
    id: "maxi",
    title: "Макси",
    value: "500 обработок",
    price: "1 490 ₽",
    priceValue: 1490,
    note: "2.9 ₽ за обработку",
    text: "Для больших архивов, учебных материалов и регулярной работы с записями.",
    action: "Оплатить"
  })
]);

export function getVisiblePaymentPackages(user) {
  return PAYMENT_PACKAGES.filter((item) => item.id !== "start" || !user?.startPackageUsed);
}
