export function getAvailableProcessingCount(user, recordsUsed = 0, recordLimit = 0) {
  if (Number(user?.packageQuota || 0) > 0) {
    return Math.max(Number(user?.recordsRemaining || 0) + Number(user?.packageRemaining || 0), 0);
  }

  if (user?.recordsRemaining !== undefined && user?.recordsRemaining !== null) {
    return Math.max(Number(user.recordsRemaining || 0), 0);
  }

  return Math.max(Number(recordLimit || 0) - Number(recordsUsed || 0), 0);
}

export function getProcessingUsageText(user) {
  const processedTotal = Math.max(Number(user?.recordsProcessedTotal || 0), 0);
  const quota = Math.max(Number(user?.processingQuota || 0), 0);
  const used = Math.max(Number(user?.processingUsed || 0), 0);
  const freeLimit = Math.max(Number(user?.recordLimit || 0), 0);

  if (user?.processingEnabled || (user?.accessExpiresAt && new Date(user.accessExpiresAt).getTime() > Date.now())) {
    return `Обработок: ${processedTotal} всего`;
  }

  if (quota > 0) {
    return `Обработок: ${Math.min(used, quota)} из ${quota}`;
  }

  return `Обработок: ${Math.min(processedTotal, freeLimit)} из ${freeLimit}`;
}
