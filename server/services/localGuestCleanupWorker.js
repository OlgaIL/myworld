import { query } from "../db/index.js";
import { cleanupGuests } from "./guestCleanupService.js";
import { scheduleStatus } from "./guestStatisticsService.js";
import { readLocalGuestCleanupConfig } from "../config/localGuestCleanup.js";

export function nextLocalCleanupAt(now, timezone) {
  const format = new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let minute = 1; minute <= 48 * 60; minute++) {
    const instant = new Date(Math.floor(now.getTime() / 60000) * 60000 + minute * 60000);
    const parts = Object.fromEntries(format.formatToParts(instant).map(part => [part.type, part.value]));
    if (parts.hour === "05" && parts.minute === "00") return instant;
  }
  throw new Error("NEXT_CLEANUP_NOT_FOUND");
}

export async function runLocalCleanupIfDue({ timezone, dbQuery = query, cleanup = cleanupGuests, logger = console }) {
  const { now } = (await dbQuery("select now() as now")).rows[0];
  const expectedAt = scheduleStatus({ now, timezone, collectedAt: now, latest: null }).expectedAt;
  const completed = (await dbQuery(`select exists(select 1 from guest_cleanup_runs
    where started_at >= $1 and finished_at is not null and state in ('success','errors')) as completed`, [expectedAt])).rows[0].completed;
  if (completed) return { skipped: true };
  const result = await cleanup({ dryRun: false });
  logger.info?.("[local-guest-cleanup]", result);
  return result;
}

export function startLocalGuestCleanupWorker({ env = process.env, logger = console } = {}) {
  const config = readLocalGuestCleanupConfig(env);
  if (!config.enabled) {
    if (config.error) logger.error?.("[local-guest-cleanup] disabled:", config.error);
    return () => {};
  }
  let stopped = false;
  let timer;
  async function tick() {
    try { await runLocalCleanupIfDue({ timezone: config.timezone, logger }); }
    catch (error) { logger.error?.("[local-guest-cleanup] failed:", { code: error.code || "LOCAL_CLEANUP_FAILED" }); }
    if (!stopped) {
      const now = new Date();
      timer = setTimeout(tick, Math.max(1000, nextLocalCleanupAt(now, config.timezone) - now));
      timer.unref();
    }
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}
