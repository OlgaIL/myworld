import test from "node:test";
import assert from "node:assert/strict";
import { createClarityController, isClarityUrlSafe, isClarityReferrerSafe, CLARITY_CONSENT_KEY } from "../src/services/clarity.js";

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
  const controller = createClarityController(win, doc, { PROD: true });
  controller.install();
  return { win, doc, controller, calls, scripts, navigation, listeners, values };
}

test("multipage upload and page progress navigate without reloading or unmounting the upload queue",()=>{
  const f=fixture();f.controller.chooseConsent(true);
  const documentPath="/documents/d-349d846f-b1f5-47d7-b821-780a38660255";
  const paths=["/documents/upload",documentPath,`${documentPath}?page=123`,`${documentPath}?page=124`];
  for(const path of paths){
    assert.equal(isClarityUrlSafe(path,f.win.location.origin),true,path);
    assert.equal(f.controller.isPrivateTransition(path),false,path);
    f.win.history.pushState({},"",path);
    f.win.history.replaceState({},"",path);
  }
  assert.deepEqual(f.navigation,[]);
  assert.equal(f.calls.length,paths.length*2);
  assert.equal(f.scripts.length,1);
});

test("multipage navigation still excludes unknown IDs and arbitrary query values",()=>{
  const origin="https://word2you.ru",path="/documents/d-349d846f-b1f5-47d7-b821-780a38660255";
  for(const url of ["/documents/d-private-name","/documents/upload?page=123",`${path}?page=private`,`${path}?page=123&email=private`,`${path}?page=123&page=124`,`${path}?view=tables`,`${path}#private`,`${path}?page=0`,`${path}?page=-1`]){
    assert.equal(isClarityUrlSafe(url,origin),false,url);
  }
});

test("safe URLs exclude admin, arbitrary filenames, query parameters, hashes and other origins", () => {
  const origin = "https://word2you.ru";
  for (const url of ["/", "/account", "/photo-to-text", "/handwriting-to-text", "/guest-documents/123", "/documents/1792012345678-12345678-1234-1234-1234-123456789abc.jpg"]) assert.equal(isClarityUrlSafe(url, origin), true, url);
  for (const url of ["/admin-control", "/documents/secret.jpg", "/?email=private", "/#code", "/photo-to-text?utm_source=test", "/photo-to-text#how", "https://mirror.ru/", "mailto:private@example.org"]) assert.equal(isClarityUrlSafe(url, origin), false, url);
  assert.equal(isClarityReferrerSafe("https://yandex.ru/", origin), true);
  assert.equal(isClarityReferrerSafe("https://other.test/private-name", origin), false);
  assert.equal(isClarityReferrerSafe("https://other.test/?email=private", origin), false);
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
  assert.equal(f.scripts[0].src, "https://www.clarity.ms/tag/yy89cpbeew");
  assert.deepEqual(f.win.clarity.q, [["consentv2", { analytics_Storage: "granted", ad_Storage: "denied" }]]);
});

test("another provider's consents never authorize Clarity", () => {
  for (const oldKey of ["word2you_inspectlet_consent_v1", "word2you_clarity_consent_v1", "word2you_clarity_consent_v2_documents", "word2you_clarity_consent_v3_account", "word2you_cookie_notice_accepted"]) {
    const f = fixture();
    f.values.set(oldKey, "granted");
    f.controller.sync();
    assert.equal(f.scripts.length, 0);
    f.controller.chooseConsent(true);
    assert.equal(f.values.get(CLARITY_CONSENT_KEY), "granted");
    assert.equal(f.scripts.length, 1);
  }
});

test("private navigation reloads before history mutation; revocation reloads without recording", () => {
  const f = fixture(); f.controller.chooseConsent(true);
  f.win.history.pushState({}, "", "/admin-control");
  assert.deepEqual(f.navigation, ["/admin-control"]);
  assert.equal(f.calls.length, 0);
  f.controller.chooseConsent(false);
  assert.equal(f.values.get(CLARITY_CONSENT_KEY), "denied");
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
  for (const config of [{ PROD: false }, { PROD: true, VITE_CLARITY_ENABLED: "false" }, { PROD: true, VITE_CLARITY_HOSTS: "mirror.ru" }]) {
    const k = fixture(); k.values.set(CLARITY_CONSENT_KEY, "granted");
    createClarityController(k.win, k.doc, config).sync(); assert.equal(k.scripts.length, 0);
  }
});


test("storage revocation stops the recorder and denies both consent types", () => {
  const f = fixture(); f.controller.chooseConsent(true);
  f.listeners.storage({ key: CLARITY_CONSENT_KEY, newValue: null });
  assert.deepEqual(f.win.clarity.q.slice(-2), [["consentv2", { analytics_Storage: "denied", ad_Storage: "denied" }], ["stop"]]);
  assert.equal(f.navigation.at(-1), "reload");
});

test("replaceState and back navigation exclude admin before other listeners mount it", () => {
  const f = fixture(); f.controller.chooseConsent(true);
  f.win.history.replaceState({}, "", "/admin-control/ocr-check");
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.navigation, ["/admin-control/ocr-check"]);
  assert.deepEqual(f.win.clarity.q.at(-1), ["stop"]);
  f.win.location.href = "https://word2you.ru/admin-control";
  let stopped = false;
  f.listeners.popstate({ stopImmediatePropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(f.navigation.at(-1), "reload");
});

test("all admin and unknown direct visits never inject a recorder", () => {
  for (const url of ["/admin-control", "/admin-control/ocr-check", "/unknown"]) {
    const f = fixture(); f.win.location.href = f.win.location.origin + url;
    f.controller.chooseConsent(true); assert.equal(f.scripts.length, 0);
  }
});
