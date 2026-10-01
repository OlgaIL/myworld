import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.js";

async function requestHealth(checkMonitorDatabase) {
  const server = createApp({ checkMonitorDatabase });
  const listener = await new Promise((resolve) => {
    const active = server.listen(0, "127.0.0.1", () => resolve(active));
  });
  try {
    const address = listener.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/monitor/health`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
}

test("monitor health returns only a safe status when database responds", async () => {
  assert.deepEqual(await requestHealth(async () => {}), { status: 200, body: { status: "ok" } });
});

test("monitor health returns 503 when database fails", async () => {
  const result = await requestHealth(async () => { throw new Error("secret connection detail"); });
  assert.deepEqual(result, { status: 503, body: { status: "unavailable" } });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("monitor health returns 503 when database check throws synchronously", async () => {
  assert.deepEqual(await requestHealth(() => { throw new Error("secret"); }), {
    status: 503,
    body: { status: "unavailable" }
  });
});
