import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createOcrReviewRouter } from "../routes/ocrReviewRoutes.js";

test("admin review checks authentication and token, deduplicates requests and continues after a failed case", async () => {
  const session = {};
  let calls = 0;
  let tableCalls = 0;
  const service = {
    async list() { return { cases: [{ id: "one" }], profiles: {} }; },
    async process(id) { calls++; if (id === "bad") throw new Error("timeout"); return { info: { status: "processed", text: "synthetic" } }; },
    async tables() { tableCalls++; return { tableStatus: tableCalls === 1 ? "error" : "ready" }; }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = session; next(); });
  app.use(createOcrReviewRouter({ service, requireAdmin(req, res, next) {
    if (req.get("Test-Admin") !== "yes") return res.sendStatus(401);
    next();
  } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/cases`)).status, 401);
    for (const [url, method] of [["/cases/one/file", "GET"], ["/cases/one/process", "POST"], ["/cases/one/tables", "POST"]]) {
      assert.equal((await fetch(base + url, { method })).status, 401);
    }
    const configResponse = await fetch(`${base}/cases`, { headers: { "Test-Admin": "yes" } });
    assert.equal(configResponse.headers.get("cache-control"), "no-store");
    const config = await configResponse.json();
    const headers = { "Test-Admin": "yes", "Content-Type": "application/json" };
    const post = (id, token = config.token, runId = "run") => fetch(`${base}/cases/${id}/process`, {
      method: "POST", headers: { ...headers, "X-Ocr-Review-Token": token }, body: JSON.stringify({ runId, audience: "free" })
    });
    assert.equal((await post("one", "wrong")).status, 403);
    const responses = await Promise.all([post("one"), post("one")]);
    assert.equal(responses[0].status, 200); assert.equal(calls, 1);
    const failed = await (await post("bad")).json();
    assert.equal(failed.info.status, "error");
    assert.equal((await (await post("two")).json()).info.status, "processed");
    const tableResponse = await fetch(`${base}/cases/one/tables`, { method: "POST",
      headers: { ...headers, "X-Ocr-Review-Token": config.token }, body: JSON.stringify({ runId: "run" }) });
    assert.equal((await tableResponse.json()).info.tableStatus, "error");
    const retryTables = () => fetch(`${base}/cases/one/tables`, { method: "POST",
      headers: { ...headers, "X-Ocr-Review-Token": config.token }, body: JSON.stringify({ runId: "run" }) });
    assert.equal((await (await retryTables()).json()).info.tableStatus, "ready");
    assert.equal((await (await retryTables()).json()).info.tableStatus, "ready");
    assert.equal(tableCalls, 2);
    const expired = await fetch(`${base}/cases/one/tables`, { method: "POST",
      headers: { ...headers, "X-Ocr-Review-Token": config.token }, body: JSON.stringify({ runId: "unknown" }) });
    assert.equal(expired.status, 409);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
