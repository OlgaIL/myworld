// Pure configuration, also used by the explicit synthetic CLI.
export function readTimewebConfig(env = process.env) {
  return {
    enabled: env.TIMEWEB_AI_ENABLED === "true", apiKey: env.TIMEWEB_API_KEY || "",
    baseURL: env.TIMEWEB_BASE_URL || "https://api.timeweb.ai/v1", model: env.TIMEWEB_MODEL || "",
    timeoutMs: Number(env.TIMEWEB_TIMEOUT_MS || 20000), maxTokens: Number(env.TIMEWEB_MAX_TOKENS || 6000)
  };
}

export function timewebConfigurationError(config) {
  if (!config.enabled) return "TIMEWEB_AI_DISABLED";
  if (!String(config.apiKey || "").trim()) return "TIMEWEB_API_KEY_MISSING";
  if (!String(config.model || "").trim()) return "TIMEWEB_MODEL_MISSING";
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 2147483647) return "TIMEWEB_TIMEOUT_INVALID";
  if (!Number.isSafeInteger(config.maxTokens) || config.maxTokens < 1) return "TIMEWEB_MAX_TOKENS_INVALID";
  try {
    const url = new URL(config.baseURL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:"))
      || url.username || url.password || url.search || url.hash) return "TIMEWEB_BASE_URL_INVALID";
  } catch { return "TIMEWEB_BASE_URL_INVALID"; }
  return null;
}

export function safeTimewebSettings(config) {
  return { enabled: config.enabled, configured: timewebConfigurationError({ ...config, enabled: true }) === null,
    model: config.model, timeoutMs: config.timeoutMs, maxTokens: config.maxTokens };
}
