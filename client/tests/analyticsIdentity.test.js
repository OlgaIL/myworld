import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnalyticsDeviceContext,
  getStoredMetrikaClientId,
  rememberMetrikaClientId,
  requestMetrikaClientId,
  requestMetrikaClientIdWhenReady,
  setAuthenticatedMetrikaUser
} from "../src/services/analytics.js";

test("stores only a validated Metrika ClientID for the login handoff", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };

  assert.equal(rememberMetrikaClientId("123456789", storage), true);
  assert.equal(getStoredMetrikaClientId(storage), "123456789");
  assert.equal(rememberMetrikaClientId("unsafe-id", storage), false);
  assert.equal(getStoredMetrikaClientId(storage), "123456789");
});

test("sets only the internal user id and never throws when Metrika fails", () => {
  const calls = [];
  const ym = (...args) => calls.push(args);

  assert.equal(setAuthenticatedMetrikaUser(42, ym), true);
  assert.deepEqual(calls[0].slice(1), ["setUserID", "42"]);
  assert.equal(setAuthenticatedMetrikaUser(42, () => { throw new Error("offline"); }), false);
});

test("gets ClientID through a callback and tolerates unavailable Metrika", () => {
  let received = "";
  const ym = (counterId, command, callback) => {
    assert.equal(command, "getClientID");
    callback("1234567890");
  };

  assert.equal(requestMetrikaClientId((value) => { received = value; }, ym), true);
  assert.equal(received, "1234567890");
  assert.equal(requestMetrikaClientId(() => {}, null), false);
});

test("waits for Metrika before requesting ClientID", () => {
  const scheduled = [];
  let lookupCount = 0;
  let receivedClientId = "";
  const ym = (counterId, command, callback) => {
    assert.equal(command, "getClientID");
    callback("456789");
  };

  requestMetrikaClientIdWhenReady((clientId) => {
    receivedClientId = clientId;
  }, {
    maxAttempts: 3,
    getYm: () => {
      lookupCount += 1;
      return lookupCount === 1 ? null : ym;
    },
    schedule: (handler) => scheduled.push(handler)
  });

  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.equal(receivedClientId, "456789");
});

test("normalizes mobile, tablet and browser information without personal data", () => {
  assert.deepEqual(
    getAnalyticsDeviceContext({
      userAgent: "Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit Chrome/151.0",
      platform: "Linux armv8l"
    }),
    { deviceType: "mobile", deviceOs: "android", deviceBrowser: "chrome" }
  );
  assert.deepEqual(
    getAnalyticsDeviceContext({
      userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit Safari/537.36",
      platform: "Linux armv8l"
    }),
    { deviceType: "tablet", deviceOs: "android", deviceBrowser: "safari" }
  );
});
