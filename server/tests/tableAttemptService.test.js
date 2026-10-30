import assert from "node:assert/strict";
import test from "node:test";
import { reserveTableAttempt, finishTableAttempt, getTableAttemptSummary } from "../services/tableAttemptService.js";

test("reserves an attempt atomically with a durable event and a three-attempt limit", async () => {
  const record = { id: "12", table_attempts: 3 };
  assert.equal(await reserveTableAttempt(7, 8, async (sql, params) => {
    assert.match(sql, /table_attempts < \$3/);
    assert.match(sql, /table_status <> 'ready'/);
    assert.match(sql, /insert into table_processing_attempts/);
    assert.deepEqual(params, [7, 8, 3]);
    return { rows: [record] };
  }), record);
  assert.equal(await reserveTableAttempt(7, 8, async () => ({ rows: [] })), null);
});

test("only a ready table is a success; review, errors and no-tables are failures", async () => {
  for (const status of ["ready", "review", "error", "no_tables"]) {
    await finishTableAttempt(1, { status, code: "TABLE_INVALID_STRUCTURE" }, 120, async (_sql, params) => {
      assert.equal(params[1], status === "ready" ? "success" : "failure");
      assert.equal(params[2], status);
      assert.equal(params[4], 120);
    });
  }
});

test("persists bounded validation metadata separately from document content", async () => {
  const diagnostic = { stage: "structure", reason: "ROW_WIDTH", field: "tables[0].rows[1]", actual: 3, expected: 4 };
  await finishTableAttempt(1, { status: "review", code: "TABLE_INVALID_STRUCTURE", validationDiagnostic: diagnostic }, 10,
    async (sql, params) => {
      assert.match(sql, /validation_diagnostic = \$13::jsonb/u);
      assert.deepEqual(JSON.parse(params[12]), diagnostic);
    });
});

test("summarizes calls and results for the selected period without document content", async () => {
  const summary = await getTableAttemptSummary(48, async (sql, params) => {
    assert.match(sql, /table_processing_attempts/);
    if(!sql.includes("group by"))assert.match(sql, /outcome = 'running'/);
    assert.deepEqual(params, [48]);
    return { rows: [{ attempts: "8", successes: "3", failures: "3", pending: "1", unfinished: "1" }] };
  });
  assert.deepEqual(summary, { hours: 48, attempts: 8, successes: 3, failures: 3, pending: 1, unfinished: 1, models:[] });
  await assert.rejects(getTableAttemptSummary(3), RangeError);
});
