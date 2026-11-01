import assert from "node:assert/strict";
import test from "node:test";
import { canAutoRestoreTables, clearPendingTableRestore, consumePendingTableRestore,
  getPendingTableRestore, hasTableIntent, rememberPendingTableRestore } from "./tableFlow.js";

function mockStorage() {
  const data = new Map();
  globalThis.window = { sessionStorage: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  } };
  return data;
}

test("restoration authorization belongs to one document and is consumed once, including after a failed request", () => {
  mockStorage();
  rememberPendingTableRestore("one.png");
  assert.equal(getPendingTableRestore(), "one.png");
  assert.equal(consumePendingTableRestore("another.png"), false);
  assert.equal(consumePendingTableRestore("one.png"), true);
  assert.equal(consumePendingTableRestore("one.png"), false);
  assert.equal(getPendingTableRestore(), "");
});

test("expired, malformed or unavailable storage never authorizes a model call", () => {
  const data = mockStorage();
  for (const value of ["broken", "null", JSON.stringify({ documentId: "one.png" }),
    JSON.stringify({ documentId: "one.png", requestedAt: Date.now() - 31 * 60 * 1000 }),
    JSON.stringify({ documentId: "one.png", requestedAt: Date.now() + 60000 })]) {
    data.set("word2you_pending_table_restore", value);
    assert.equal(getPendingTableRestore(), "");
    assert.equal(consumePendingTableRestore("one.png"), false);
  }
  window.sessionStorage = { getItem() { throw Error("unavailable"); },
    setItem() { throw Error("unavailable"); }, removeItem() { throw Error("unavailable"); } };
  assert.doesNotThrow(() => rememberPendingTableRestore("one.png"));
  assert.equal(consumePendingTableRestore("one.png"), false);
});

test("another login can cancel the pending automatic restoration", () => {
  mockStorage();
  rememberPendingTableRestore("one.png");
  clearPendingTableRestore();
  assert.equal(consumePendingTableRestore("one.png"), false);
});

test("opening a promo or table URL only selects the tab and never authorizes restoration", () => {
  mockStorage();
  assert.equal(hasTableIntent("?intent=tables&utm_source=test"), true);
  assert.equal(hasTableIntent("?view=tables"), true);
  assert.equal(hasTableIntent("?intent=batch"), false);
  assert.equal(consumePendingTableRestore("one.png"), false);
});

test("automatic restoration respects auth, initial processing, balance and previous attempts", () => {
  const valid = { isAuthenticated: true, tableLocked: false, enrichmentPending: false,
    info: { hasTable: true, status: "processed", tableStatus: "not_started", tableAttempts: 0 } };
  assert.equal(canAutoRestoreTables(valid), true);
  for (const patch of [{ isAuthenticated: false }, { tableLocked: true }, { enrichmentPending: true }]) {
    assert.equal(canAutoRestoreTables({ ...valid, ...patch }), false);
  }
  for (const patch of [{ hasTable: false }, { status: "recognized" }, { status: "error" },
    { tableStatus: "ready" }, { tableStatus: "error" }, { tableStatus: "review" },
    { tableStatus: "no_tables" }, { tableAttempts: 1 }, { tableAttempts: 3 }]) {
    assert.equal(canAutoRestoreTables({ ...valid, info: { ...valid.info, ...patch } }), false);
  }
});
