import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { createUploadAlerts } from "../services/uploadAlertsService.js";

const minute = 60_000;
const hour = 60 * minute;

function setup(send) {
  let time = Date.parse("2026-11-19T12:00:00Z");
  const messages = [];
  const errors = [];
  const monitor = createUploadAlerts({
    now: () => time,
    log: message => errors.push(message),
    send: async message => { await send?.(); messages.push(message); }
  });

  async function respond(method, path, statusCode, query = {}, headers = {}) {
    const req = { method, path, query, get: name => headers[name] };
    const res = Object.assign(new EventEmitter(), { statusCode });
    monitor.middleware(req, res, () => res.emit("finish"));
    // Let the middleware's pending delivery settle without polling for new work.
    await new Promise(resolve => setImmediate(resolve));
  }

  return { messages, errors, respond, check: monitor.check, advance: ms => { time += ms; } };
}

test("alerts on the first server failure and rate limits duplicates across upload routes", async () => {
  const monitor = setup();
  await monitor.respond("POST", "/api/guest/upload", 413);
  await monitor.respond("GET", "/api/document-uploads/batch-id", 500);
  assert.deepEqual(monitor.messages, []);

  await monitor.respond("POST", "/api/guest/upload", 500);
  await monitor.respond("PUT", "/api/document-uploads/batch-id/items/item-id", 503);
  assert.equal(monitor.messages.length, 1);
  assert.match(monitor.messages[0], /15:00 МСК\nГость: .*HTTP 500/);

  monitor.advance(15 * minute);
  await monitor.respond("POST", "/api/document-uploads", 500);
  assert.match(monitor.messages[1], /Личный кабинет: .*HTTP 500/);
  assert.doesNotMatch(monitor.messages.join("\n"), /batch-id|item-id/);
});

test("warns once when paid traffic continues for a window with no file uploads", async () => {
  const monitor = setup();
  monitor.advance(2 * hour);
  await monitor.respond("GET", "/", 200, { yclid: "123" }, { "Sec-Purpose": "prefetch" });
  await monitor.respond("GET", "/", 200, { utm_medium: "organic" });
  await monitor.respond("GET", "/photo-to-text", 301, { yclid: "456" });
  monitor.advance(hour);
  await monitor.check();
  assert.deepEqual(monitor.messages, []);

  await monitor.respond("GET", "/photo-to-text", 200, { utm_medium: "cpc" });
  await monitor.respond("POST", "/api/document-uploads", 200);
  await monitor.check();
  assert.deepEqual(monitor.messages, []);
  monitor.advance(2 * hour);
  await monitor.respond("GET", "/", 200, { yclid: "789" });
  monitor.advance(hour);
  await monitor.check();
  await monitor.check();
  assert.equal(monitor.messages.length, 1);
  assert.match(monitor.messages[0], /3 часа.*успешных загрузок фото — 0/);

  await monitor.respond("PUT", "/api/document-uploads/batch-id/items/item-id", 200);
  monitor.advance(2 * hour);
  await monitor.respond("GET", "/", 200, { yclid: "987" });
  monitor.advance(hour - minute);
  await monitor.check();
  assert.equal(monitor.messages.length, 1);
  monitor.advance(minute);
  await monitor.check();
  assert.equal(monitor.messages.length, 2);
});

test("retries a failed Telegram delivery without logging the provider error", async () => {
  let attempts = 0;
  const monitor = setup(() => {
    attempts += 1;
    if (attempts === 1) throw new Error("sensitive provider error");
  });
  await monitor.respond("POST", "/api/upload", 500);
  await monitor.respond("POST", "/api/upload", 500);
  assert.equal(attempts, 1);
  assert.deepEqual(monitor.errors, ["[upload-alerts] Telegram delivery failed"]);

  monitor.advance(minute);
  await monitor.check();
  assert.equal(attempts, 2);
  assert.equal(monitor.messages.length, 1);
});
