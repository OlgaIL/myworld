export function getTableAttemptState(info, now = Date.now()) {
  const limit = Number(info?.tableAttemptsLimit) || 3;
  const used = Math.max(0, Number(info?.tableAttempts) || 0);
  const failed = ["review", "error", "no_tables"].includes(info?.tableStatus) || (used >= limit && info?.tableStatus !== "ready");
  const blocked = failed && info?.tableRetryable === false;
  const waiting = failed && new Date(info?.tableRetryAfter).getTime() > now;
  return { limit, used, remaining: Math.max(0, limit - used), blocked, waiting,
    disabled: blocked || waiting || (info?.tableStatus !== "ready" && used >= limit),
    exhausted: info?.tableStatus !== "ready" && used >= limit,
    failed };
}

export function tableFailureMessage(info) {
  if (info?.tableFailureKind === "temporary") {
    return "Проблемы со связью, к сожалению, такое случается. Повторите чуть попозже.";
  }
  if (info?.tableNextAction === "repair_format") return "Не удалось оформить таблицу. Попробуйте ещё раз.";
  if (info?.tableNextAction === "split_grid") return "Не удалось собрать все таблицы. Попробуем обработать их по отдельности.";
  if (info?.tableNextAction === "inventory_page") return "Не удалось собрать все таблицы. Проверим всю страницу и обработаем таблицы по отдельности.";
  if (info?.tableFailureKind === "source") return "Для сборки таблиц загрузите этот документ заново.";
  if (["service", "placement"].includes(info?.tableFailureKind)) return "Не удалось завершить сборку таблиц из-за технической ошибки.";
  if (info?.tableStatus === "no_tables") return "Не удалось найти таблицы на фото.";
  return "К сожалению, не удалось надёжно собрать эту таблицу.";
}
