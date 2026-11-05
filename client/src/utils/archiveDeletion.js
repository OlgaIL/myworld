export function recordCountLabel(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? "записей"
    : last === 1 ? "запись" : last >= 2 && last <= 4 ? "записи" : "записей";
  return `${count} ${word}`;
}

export function getDeletionOutcome(targets, response) {
  const confirmed = new Set(response?.deleted || []);
  const absent = new Set(response?.missing || []);
  const unique = [...new Set(targets)];
  return {
    deleted: unique.filter(name => confirmed.has(name)),
    missing: unique.filter(name => !confirmed.has(name) && absent.has(name)),
    failed: unique.filter(name => !confirmed.has(name) && !absent.has(name))
  };
}

export function deletionErrorMessage(code) {
  if (code === "ACCOUNT_BUSY") {
    return "Сейчас выполняется другая операция. Дождитесь её завершения и повторите удаление.";
  }
  if (code === "DOCUMENT_BUSY") {
    return "Записи сейчас обрабатываются или проверяются. Повторите удаление после завершения.";
  }
  if (code === "UNAUTHORIZED") return "Войдите в аккаунт и повторите удаление.";
  if (code === "DELETE_CONFIRMATION_UNAVAILABLE") {
    return "Не удалось получить подтверждение удаления. Проверьте архив и при необходимости повторите удаление.";
  }
  return "Не удалось завершить удаление. Попробуйте ещё раз.";
}
