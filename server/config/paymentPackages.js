export const PAYMENT_PACKAGES = Object.freeze([
  Object.freeze({
    id: "start",
    title: "Старт",
    amount: 20,
    price: 99,
    description: "Чтобы продолжить работу и проверить сервис на большем количестве фотографий",
    oneTime: true
  }),
  Object.freeze({ id: "mini", title: "Мини", amount: 50, price: 290, oneTime: false }),
  Object.freeze({ id: "standard", title: "Стандарт", amount: 150, price: 590, oneTime: false }),
  Object.freeze({ id: "maxi", title: "Макси", amount: 500, price: 1490, oneTime: false })
]);

const packagesById = new Map(PAYMENT_PACKAGES.map((item) => [item.id, item]));
const packagesByTitle = new Map(PAYMENT_PACKAGES.map((item) => [item.title, item]));

export function getPaymentPackage({ packageId, packageTitle } = {}) {
  const normalizedId = String(packageId || "").trim().toLowerCase();
  if (normalizedId && packagesById.has(normalizedId)) {
    return packagesById.get(normalizedId);
  }

  return packagesByTitle.get(String(packageTitle || "").trim()) || null;
}
