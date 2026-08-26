import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnalyticsDeviceContext,
  requestMetrikaClientId,
  setAuthenticatedMetrikaUser
} from "../src/services/analytics.js";

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
