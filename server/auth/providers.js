import { isAuthProviderEnabled } from "../config/env.js";
import {
  EMAIL_OTP_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  MTS_CLIENT_ID,
  MTS_CLIENT_SECRET,
  SBER_CLIENT_ID,
  SBER_CLIENT_SECRET,
  VK_CLIENT_ID,
  VK_CLIENT_SECRET,
  YANDEX_CLIENT_ID,
  YANDEX_CLIENT_SECRET,
  SMTP_PASSWORD
} from "../config/private-env.js";
import { SMTP_FROM, SMTP_HOST, SMTP_USER } from "../config/env.js";

const providerDefinitions = [
  { id: "google", label: "Google", clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET },
  { id: "yandex", label: "Яндекс", clientId: YANDEX_CLIENT_ID, clientSecret: YANDEX_CLIENT_SECRET },
  { id: "vk", label: "VK ID", clientId: VK_CLIENT_ID, clientSecret: VK_CLIENT_SECRET },
  { id: "sber", label: "Сбер ID", clientId: SBER_CLIENT_ID, clientSecret: SBER_CLIENT_SECRET },
  { id: "mts", label: "МТС ID", clientId: MTS_CLIENT_ID, clientSecret: MTS_CLIENT_SECRET },
  {
    id: "email",
    label: "Продолжить по email",
    configured: () => Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD && SMTP_FROM && EMAIL_OTP_SECRET)
  }
];

export function isAuthProviderConfigured(providerId) {
  const provider = providerDefinitions.find(({ id }) => id === providerId);
  return Boolean(
    provider
    && isAuthProviderEnabled(providerId)
    && (provider.configured ? provider.configured() : provider.clientId && provider.clientSecret)
  );
}

export function getConfiguredAuthProviders() {
  return providerDefinitions
    .filter(({ id }) => isAuthProviderConfigured(id))
    .map(({ id, label }) => ({ id, label }));
}
