import { ADMIN_PROTECTED_USER_IDS } from "../config/env.js";

export const deletionMessages = {
  DELETION_PROTECTION_CONFIG: "Удаление выключено: задайте корректный непустой ADMIN_PROTECTED_USER_IDS и перезапустите сервер.",
  DELETION_NOT_READY: "Удаление выключено: требуется миграция 034.",
  ACCOUNT_PROTECTED: "Этот аккаунт защищён от удаления.",
  ACCOUNT_CURRENT_USER: "Нельзя удалить текущий аккаунт администраторской сессии.",
  ACCOUNT_HAS_PAYMENTS: "Удаление запрещено: у аккаунта есть платежи, включая неуспешные и тестовые.",
  ACCOUNT_PAID_CREDITS: "Удаление запрещено: есть начисления, связанные с оплатой.",
  ACCOUNT_BUSY: "Аккаунт занят загрузкой, обработкой или переносом. Дождитесь завершения и повторите.",
  ACCOUNT_SHARED_DATA: "Удаление запрещено: гостевые связи или заявки принадлежат другому пользователю. Требуется проверка связей.",
  ACCOUNT_UNSAFE_FILES: "Удаление запрещено: путь файла не проходит проверку безопасности. Требуется проверка хранилища.",
  USER_NOT_FOUND: "Аккаунт не найден или уже удалён. Обновите список пользователей.",
  INVALID_USER_ID: "Некорректный ID аккаунта.",
  DELETION_CONFIRMATION_REQUIRED: "Для подтверждения введите точный ID удаляемого аккаунта.",
  DELETION_CSRF: "Защита запроса не пройдена. Обновите карточку и повторите.",
  ACCOUNT_DELETE_FAILED: "Не удалось удалить аккаунт. Обновите карточку перед повтором."
};

export function validUserId(value) {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

export function parseProtectedUserIds(value) {
  if (typeof value !== "string" || !value.trim()) return { valid: false, ids: [] };
  const ids = value.split(",").map((id) => id.trim());
  return ids.every(validUserId) ? { valid: true, ids: [...new Set(ids)] } : { valid: false, ids: [] };
}

export const configuredProtection = parseProtectedUserIds(ADMIN_PROTECTED_USER_IDS);

export class AccountDeletionError extends Error {
  constructor(code, status = 409) {
    super(deletionMessages[code] || deletionMessages.ACCOUNT_DELETE_FAILED);
    this.code = code;
    this.status = status;
  }
}

export function protectionReason(userId, currentUserId, protection = configuredProtection) {
  if (!protection.valid) return "DELETION_PROTECTION_CONFIG";
  if (protection.ids.includes(String(userId))) return "ACCOUNT_PROTECTED";
  if (currentUserId && String(currentUserId) === String(userId)) return "ACCOUNT_CURRENT_USER";
  return null;
}
