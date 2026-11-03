import test from "node:test";
import assert from "node:assert/strict";
import { createInspectletController, isInspectletUrlSafe, isInspectletReferrerSafe, INSPECTLET_CONSENT_KEY } from "../src/services/inspectlet.js";

function fixture(overrides = {}) {
  const calls = [], scripts = [], navigation = [], listeners = {};
  const values = new Map();
  const win = {
    location: { origin: "https://word2you.ru", hostname: "word2you.ru", href: "https://word2you.ru/", assign: url => navigation.push(url), replace: url => navigation.push(url), reload: () => navigation.push("reload") },
    history: { pushState: (...args) => calls.push(args), replaceState: (...args) => calls.push(args) },
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    addEventListener: (name, cb) => { listeners[name] = cb; },
    dispatchEvent: event => listeners[event.type]?.(event)
  };
  const doc = { referrer: "", createElement: () => ({}), head: { appendChild: script => scripts.push(script) } };
  Object.assign(doc, overrides);
  const controller = createInspectletController(win, doc, { PROD: true });
  controller.install();
  return { win, doc, controller, calls, scripts, navigation, listeners, values };
}

test("safe URLs exclude admin, arbitrary filenames, query parameters, hashes and other origins", () => {
  const origin = "https://word2you.ru";
  for (const url of ["/", "/account", "/photo-to-text", "/handwriting-to-text", "/guest-documents/123", "/documents/1792012345678-12345678-1234-1234-1234-123456789abc.jpg"]) assert.equal(isInspectletUrlSafe(url, origin), true, url);
  for (const url of ["/admin-control", "/documents/secret.jpg", "/?email=private", "/#code", "/photo-to-text?utm_source=test", "/photo-to-text#how", "https://mirror.ru/", "mailto:private@example.org"]) assert.equal(isInspectletUrlSafe(url, origin), false, url);
  assert.equal(isInspectletReferrerSafe("https://yandex.ru/", origin), true);
  assert.equal(isInspectletReferrerSafe("https://other.test/private-name", origin), false);
  assert.equal(isInspectletReferrerSafe("https://other.test/?email=private", origin), false);
});

test("loads only after explicit consent, once across rerenders and SPA navigation", () => {
  const f = fixture();
  f.win.location.href = "https://word2you.ru/photo-to-text";
  f.controller.sync();
  assert.equal(f.scripts.length, 0);
  f.controller.chooseConsent(false);
  assert.equal(f.scripts.length, 0);
  f.controller.chooseConsent(true);
  f.controller.sync(); f.controller.install();
  f.win.history.pushState({}, "", "/about");
  f.controller.sync();
  assert.equal(f.scripts.length, 1);
  assert.match(f.scripts[0].src, /^https:\/\/cdn\.inspectlet\.com\/inspectlet\.js\?wid=390286863&r=\d+$/);
  assert.deepEqual(f.win.__insp, [["wid", 390286863]]);
});

test("another provider's consents never authorize Inspectlet", () => {
  for (const oldKey of ["word2you_clarity_consent_v1", "word2you_clarity_consent_v2_documents", "word2you_clarity_consent_v3_account", "word2you_cookie_notice_accepted"]) {
    const f = fixture();
    f.values.set(oldKey, "granted");
    f.controller.sync();
    assert.equal(f.scripts.length, 0);
    f.controller.chooseConsent(true);
    assert.equal(f.values.get(INSPECTLET_CONSENT_KEY), "granted");
    assert.equal(f.scripts.length, 1);
  }
});

test("private navigation reloads before history mutation; revocation reloads without recording", () => {
  const f = fixture(); f.controller.chooseConsent(true);
  f.win.history.pushState({}, "", "/admin-control");
  assert.deepEqual(f.navigation, ["/admin-control"]);
  assert.equal(f.calls.length, 0);
  f.controller.chooseConsent(false);
  assert.equal(f.values.get(INSPECTLET_CONSENT_KEY), "denied");
  assert.equal(f.navigation.at(-1), "reload");
});

test("referrers, disabled environments, storage and script failures fail closed", () => {
  const f = fixture({ referrer: "https://word2you.ru/documents/secret.jpg" });
  f.controller.chooseConsent(true); assert.equal(f.scripts.length, 0);
  const g = fixture(); g.win.location.href += "?email=secret";
  g.controller.chooseConsent(true); assert.equal(g.scripts.length, 0);
  const h = fixture(); h.win.localStorage.getItem = () => { throw Error("blocked"); };
  assert.doesNotThrow(() => h.controller.sync()); assert.equal(h.scripts.length, 0);
  const j = fixture(); j.doc.head.appendChild = () => { throw Error("CSP"); };
  assert.doesNotThrow(() => j.controller.chooseConsent(true));
  for (const config of [{ PROD: false }, { PROD: true, VITE_INSPECTLET_ENABLED: "false" }, { PROD: true, VITE_INSPECTLET_HOSTS: "mirror.ru" }]) {
    const k = fixture(); k.values.set(INSPECTLET_CONSENT_KEY, "granted");
    createInspectletController(k.win, k.doc, config).sync(); assert.equal(k.scripts.length, 0);
  }
});
