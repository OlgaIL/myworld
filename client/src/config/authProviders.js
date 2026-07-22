const authProviderMeta = {
  google: { icon: "G", title: "Войти через Google", iconClassName: "" },
  yandex: { icon: "Я", title: "Войти через Яндекс", iconClassName: "auth-menu__icon--yandex" },
  vk: { icon: "VK", title: "Войти через VK ID", iconClassName: "auth-menu__icon--vk" },
  sber: { icon: "С", title: "Войти через Сбер ID", iconClassName: "auth-menu__icon--sber" },
  mts: { icon: "М", title: "Войти через МТС ID", iconClassName: "auth-menu__icon--mts" }
};

export function getAuthProviderMeta(provider) {
  return authProviderMeta[provider.id] || {
    icon: provider.label?.[0] || "?",
    title: `Войти через ${provider.label || provider.id}`,
    iconClassName: ""
  };
}
