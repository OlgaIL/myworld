import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import presenceRoutes from "../routes/presenceRoutes.js";
import { clearPresenceForTests, getPresenceSnapshot } from "../services/presenceService.js";

test("presence uses an opaque cookie and updates auth without user data in response", async () => {
  clearPresenceForTests();
  const app = express();
  let userId = null;
  app.use((req, res, next) => { req.user = userId ? { id: userId } : null; next(); });
  app.use(presenceRoutes);
  const server = await new Promise((resolve) => {
    const active = app.listen(0, "127.0.0.1", () => resolve(active));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/presence`;
    const first = await fetch(url, { method: "POST" });
    const cookie = first.headers.get("set-cookie");
    assert.equal(first.status, 204);
    assert.match(cookie, /HttpOnly/);
    assert.equal(getPresenceSnapshot().total, 1);

    userId = 42;
    const second = await fetch(url, { method: "POST", headers: { cookie: cookie.split(";")[0] } });
    assert.equal(second.status, 204);
    assert.deepEqual(getPresenceSnapshot(), { total: 1, authenticated: 1, userIds: ["42"] });
  } finally {
    clearPresenceForTests();
    await new Promise((resolve) => server.close(resolve));
  }
});
