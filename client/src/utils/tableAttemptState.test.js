import assert from "node:assert/strict";
import test from "node:test";
import { getTableAttemptState, tableFailureMessage } from "./tableAttemptState.js";

test("first call and two retries are allowed, while cached ready tables remain available", () => {
  for (let used = 0; used <= 3; used++) {
    const state = getTableAttemptState({ tableStatus: "review", tableAttempts: used });
    assert.equal(state.remaining, 3 - used);
    assert.equal(state.exhausted, used === 3);
  }
  assert.equal(getTableAttemptState({ tableStatus: "ready", tableAttempts: 3 }).exhausted, false);
  assert.equal(getTableAttemptState({ tableStatus: "ready", tableAttempts: 3 }).failed, false);
  assert.equal(getTableAttemptState({ tableStatus: "not_started" }).remaining, 3);
});

test("messages distinguish connection, a repairable format and an unverified result", () => {
  assert.match(tableFailureMessage({ tableFailureKind: "temporary" }), /Проблемы со связью/u);
  assert.match(tableFailureMessage({ tableNextAction: "repair_format" }), /Попробуйте ещё раз/u);
  assert.match(tableFailureMessage({ tableNextAction: "split_grid" }), /по отдельности/u);
  assert.equal(getTableAttemptState({tableStatus:"review",tableAttempts:1,tableRetryable:true,tableNextAction:"split_grid"}).disabled,false);
  for (const kind of ["grid", "limit", "quality", "format"]) {
    const message = tableFailureMessage({ tableFailureKind: kind });
    assert.match(message, /не удалось надёжно/u);
    assert.equal(message.includes("слишком сложная"), false);
    assert.equal(message.includes("Попробуйте"), false);
  }
  assert.match(tableFailureMessage({ tableFailureKind: "placement" }), /технической ошибки/u);
});

test("quality failures stop identical retries while temporary failures allow the remaining tries", () => {
  const failed = { tableStatus: "review", tableAttempts: 1, tableRetryable: false };
  assert.equal(getTableAttemptState(failed).blocked, true);
  assert.equal(getTableAttemptState(failed).disabled, true);
  assert.equal(getTableAttemptState({ ...failed, tableStatus: "error", tableRetryable: true }).disabled, false);
  const limited = { ...failed, tableStatus: "error", tableRetryable: true, tableRetryAfter: "2026-10-24T12:01:00Z" };
  assert.equal(getTableAttemptState(limited, Date.parse("2026-10-24T12:00:00Z")).waiting, true);
  assert.equal(getTableAttemptState(limited, Date.parse("2026-10-24T12:01:01Z")).disabled, false);
});
