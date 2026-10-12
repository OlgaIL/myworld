import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { query, withTransaction } from "../db/index.js";
import { removeManagedFile, managedFile } from "./guestStorageFiles.js";
import { readLocalGuestCleanupConfig } from "../config/localGuestCleanup.js";

// Commit intent before IO. A lost acknowledgement can never become a claimed
// precise deletion on retry. Keys contain no file names or paths.
export async function recordGuestFileRemoval(file, { remove = removeManagedFile, allowed = ["guests"], category = "source", runId = null } = {}) {
  const canonical = process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);
  const fileKey = crypto.createHash("sha256").update(canonical).digest("hex");
  await managedFile(file, allowed);
  const exists = await fs.lstat(file).then(() => true).catch((error) => { if (error.code !== "ENOENT") throw error; return false; });
  const previous = (await query("select * from guest_file_deletions where file_key=$1 order by started_at desc limit 1", [fileKey])).rows[0];
  const recovery = previous?.result === "pending";
  if (previous && previous.result !== "pending" && !exists) {
    if (runId && previous.incomplete) await query("update guest_cleanup_runs set incomplete=true where id=$1", [runId]);
    return { result: previous.result, repeated: true, incomplete: previous.incomplete };
  }
  const key = recovery ? previous.operation_key : crypto.randomUUID();
  if (!recovery) await query(`insert into guest_file_deletions(operation_key,file_key,run_id,category,result)
    values ($1,$2,$3,$4,'pending')`, [key, fileKey, runId, category]);
  if (recovery && runId) await query("update guest_cleanup_runs set incomplete=true where id=$1", [runId]);
  const outcome = await remove(file, allowed);
  // Old injected remove callbacks returning void are supported, but give no
  // evidence of unlink and therefore cannot increase confirmed-file totals.
  const result = outcome?.removed === true ? "removed" : outcome?.missing === true ? (recovery ? "unknown" : "missing") : "unknown";
  const incomplete = recovery || result === "unknown";
  if (incomplete && runId) await query("update guest_cleanup_runs set incomplete=true where id=$1", [runId]);
  await query(`update guest_file_deletions set result=$2,confirmed_at=now(),incomplete=$3 where operation_key=$1`, [key, result, incomplete]);
  return { result, repeated: false, incomplete };
}

export async function recordTtlDocument(client, documentId) {
  // Opaque deterministic token, no retained relationship to a content row.
  const key = crypto.createHash("sha256").update(`ttl-document:${documentId}`).digest("hex").slice(0, 32);
  await client.query("insert into guest_activity_events(operation_id,kind) values ($1::uuid,'ttl_document') on conflict do nothing", [key]);
}

export const GUEST_STATISTICS_HOURS = new Set([24, 48, 168, 720]);

export function scheduleStatus({ now, collectedAt, latest, timezone }) {
  if (!timezone) return { timezone: null, time: "05:00", warning: "schedule_unconfigured" };
  let format;
  try { format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  catch { return { timezone, time: "05:00", warning: "schedule_invalid" }; }
  const local = (date) => Object.fromEntries(format.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const current = local(now);
  // Find the most recent scheduled instant with DST-aware timezone conversion.
  let expected = null;
  for (let minutes = 0; minutes <= 48 * 60; minutes++) {
    const instant = new Date(Math.floor(now.getTime() / 60000) * 60000 - minutes * 60000);
    const parts = local(instant);
    if (parts.hour === "05" && parts.minute === "00") { expected = instant; break; }
  }
  const waiting = !expected || expected < new Date(collectedAt);
  const missed = !waiting && now - expected >= 3600000 && (!latest || new Date(latest.started_at) < expected);
  return { timezone, time: "05:00", localDate: `${current.year}-${current.month}-${current.day}`, expectedAt: expected, warning: waiting ? "waiting_first_run" : missed ? "missed_schedule" : null };
}

export async function getGuestStorageSummary(hours, runTransaction = withTransaction) {
  if (!GUEST_STATISTICS_HOURS.has(hours)) throw new RangeError("Unsupported period");
  return runTransaction(async (client) => {
    await client.query("set transaction isolation level repeatable read read only");
    // Keep PostgreSQL's microseconds for every SQL boundary. pg's Date parser
    // truncates them; converting that Date back into a parameter can exclude
    // a freshly committed event from the same millisecond.
    const { now: nowDb, period_start: fromDb, collected_at: collectedAt } = (await client.query(`select now()::text as now,
      (now() - $1::int * interval '1 hour')::text as period_start,
      started_at as collected_at from guest_statistics_collection where id=true`, [hours])).rows[0] || {};
    if (!collectedAt) throw new Error("GUEST_STATISTICS_COLLECTION_MISSING");
    const now = new Date(nowDb);
    const from = new Date(fromDb);
    const events = (await client.query(`select kind,outcome,count(*)::int as count from guest_activity_events
      where occurred_at >= $1 and occurred_at < $2 group by kind,outcome`, [fromDb, nowDb])).rows;
    const period = { uploads: 0, processed: 0, recognized: 0, no_text: 0, error: 0, documentsDeleted: 0, filesRemoved: 0, filesMissing: 0, incompleteFiles: 0, categories: {} };
    for (const row of events) period[row.kind === "upload" ? "uploads" : row.kind === "ttl_document" ? "documentsDeleted" : row.outcome] += row.count;
    for (const row of (await client.query(`select category,result,incomplete,count(*)::int as count from guest_file_deletions
      where coalesce(confirmed_at,started_at) >= $1 and coalesce(confirmed_at,started_at) < $2 group by category,result,incomplete`, [fromDb, nowDb])).rows) {
      period.categories[row.category] ||= { removed: 0, missing: 0, incomplete: 0 };
      if (row.result === "removed") { period.filesRemoved += row.count; period.categories[row.category].removed += row.count; }
      if (row.result === "missing") { period.filesMissing += row.count; period.categories[row.category].missing += row.count; }
      if (row.incomplete || ["pending", "unknown"].includes(row.result)) { period.incompleteFiles += row.count; period.categories[row.category].incomplete += row.count; }
    }
    const current = (await client.query(`select count(*)::int as stored,count(*) filter(where expires_at <= $1)::int as expired
      from guest_documents where status <> 'claimed'`, [nowDb])).rows[0];
    const latest = (await client.query("select * from guest_cleanup_runs order by started_at desc limit 1")).rows[0] || null;
    const success = (await client.query("select * from guest_cleanup_runs where state='success' order by started_at desc limit 1")).rows[0] || null;
    // Compare with the actual global maintenance advisory lock, not run age.
    const locked = (await client.query(`select exists(select 1 from pg_locks where locktype='advisory'
      and classid=731241 and objid=(hashtext('maintenance')::bigint & 4294967295) and granted and pid=$1) as locked`, [latest?.lock_pid ?? null])).rows[0].locked;
    if (latest?.state === "running" && !locked && now - new Date(latest.heartbeat_at) > 120000) { latest.state = "interrupted"; latest.incomplete = true; }
    const schedule = scheduleStatus({ now, collectedAt, latest, timezone: process.env.GUEST_CLEANUP_TIMEZONE?.trim() });
    schedule.source = readLocalGuestCleanupConfig().enabled ? "local_backend" : "cron";
    return { generatedAt: now, periodStart: from, periodEnd: now, hours, collectedAt, period, current, latest, lastSuccess: success, schedule };
  });
}
