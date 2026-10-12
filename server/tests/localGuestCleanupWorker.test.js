import assert from "node:assert/strict";
import test from "node:test";
import { readLocalGuestCleanupConfig } from "../config/localGuestCleanup.js";
import { nextLocalCleanupAt, runLocalCleanupIfDue } from "../services/localGuestCleanupWorker.js";

test("local scheduler requires explicit switch, local database and timezone; production always disabled", () => {
  const env = { LOCAL_GUEST_CLEANUP_ENABLED: "true", DATABASE_URL: "postgres://synthetic@localhost/local", GUEST_CLEANUP_TIMEZONE: "Europe/Istanbul" };
  assert.equal(readLocalGuestCleanupConfig({}).enabled, false);
  assert.equal(readLocalGuestCleanupConfig(env).enabled, true);
  assert.equal(readLocalGuestCleanupConfig({ ...env, NODE_ENV: "production" }).enabled, false);
  assert.equal(readLocalGuestCleanupConfig({ ...env, DATABASE_URL: "postgres://synthetic@example.test/db" }).enabled, false);
  assert.equal(readLocalGuestCleanupConfig({ ...env, GUEST_CLEANUP_TIMEZONE: "invalid/timezone" }).enabled, false);
});

test("next run is 05:00 in configured timezone and handles DST", () => {
  assert.equal(nextLocalCleanupAt(new Date("2026-10-12T06:00:00Z"), "Europe/Istanbul").toISOString(), "2026-10-13T02:00:00.000Z");
  assert.equal(nextLocalCleanupAt(new Date("2026-10-12T01:00:00Z"), "Europe/Istanbul").toISOString(), "2026-10-12T02:00:00.000Z");
  assert.equal(nextLocalCleanupAt(new Date("2026-10-24T04:00:00Z"), "Europe/Berlin").toISOString(), "2026-10-25T04:00:00.000Z");
});

test("restart catches up a missed cleanup once and then skips completed scheduled window", async () => {
  let completed = false;
  let calls = 0;
  const dbQuery = async (sql, params) => {
    if (sql.includes("select now()")) return { rows: [{ now: new Date("2026-10-12T06:00:00Z") }] };
    assert.equal(params[0].toISOString(), "2026-10-12T02:00:00.000Z");
    return { rows: [{ completed }] };
  };
  const cleanup = async (options) => { assert.equal(options.dryRun, false); calls++; completed = true; return { deleted: 0 }; };
  const options = { timezone: "Europe/Istanbul", dbQuery, cleanup, logger: {} };
  assert.deepEqual(await runLocalCleanupIfDue(options), { deleted: 0 });
  assert.deepEqual(await runLocalCleanupIfDue(options), { skipped: true });
  assert.equal(calls, 1);
});
