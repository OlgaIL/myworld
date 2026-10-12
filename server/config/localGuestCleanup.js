// This switch must never start a second cleanup scheduler in production.
export function readLocalGuestCleanupConfig(env = process.env) {
  if (env.LOCAL_GUEST_CLEANUP_ENABLED !== "true") return { enabled: false };
  if (env.NODE_ENV === "production") return { enabled: false, error: "PRODUCTION_DISABLED" };
  try {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname)) {
      return { enabled: false, error: "LOCAL_DATABASE_REQUIRED" };
    }
  } catch { return { enabled: false, error: "LOCAL_DATABASE_REQUIRED" }; }
  const timezone = env.GUEST_CLEANUP_TIMEZONE?.trim();
  try {
    if (!timezone) throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  } catch { return { enabled: false, error: "CLEANUP_TIMEZONE_REQUIRED" }; }
  return { enabled: true, timezone };
}
