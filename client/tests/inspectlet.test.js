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

test("multipage upload and page progress navigate without reloading or unmounting the upload queue",()=>{
  const f=fixture();f.controller.chooseConsent(true);
  const documentPath="/documents/d-349d846f-b1f5-47d7-b821-780a38660255";
  const paths=["/documents/upload",documentPath,`${documentPath}?page=123`,`${documentPath}?page=124`];
  for(const path of paths){
    assert.equal(isInspectletUrlSafe(path,f.win.location.origin),true,path);
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
    assert.equal(isInspectletUrlSafe(url,origin),false,url);
  }
});

test("safe URLs exclude admin, arbitrary filenames, query parameters, hashes and other origins", () => {
  const origin = "https://word2you.ru";
  for (const url of ["/", "/account", "/photo-to-text", "/handwriting-to-text", "/guest-documents/123", "/documents/1792012345678-12345678-1234-1234-1234-123456789abc.jpg"]) assert.equal(isInspectletUrlSafe(url, origin), true, url);
  for (const url of ["/admin-control", "/documents/secret.jpg", "/?email=private", "/#code", "/photo-to-text#how", "https://mirror.ru/", "mailto:private@example.org"]) assert.equal(isInspectletUrlSafe(url, origin), false, url);
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
  for (const oldKey of ["word2you_inspectlet_consent_v1", "word2you_clarity_consent_v1", "word2you_clarity_consent_v2_documents", "word2you_clarity_consent_v3_account", "word2you_clarity_consent_v4_return", "word2you_cookie_notice_accepted"]) {
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


test("storage revocation reloads the page when consent is removed", () => {
  const f = fixture(); f.controller.chooseConsent(true);
  f.listeners.storage({ key: INSPECTLET_CONSENT_KEY, newValue: null });
  assert.equal(f.navigation.at(-1), "reload");
});

test("replaceState and back navigation exclude admin before other listeners mount it", () => {
  const f = fixture(); f.controller.chooseConsent(true);
  f.win.history.replaceState({}, "", "/admin-control/ocr-check");
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.navigation, ["/admin-control/ocr-check"]);
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


test("guests and account users may record ad landings after consent", () => {
  for (const path of ["/?utm_source=yandex&utm_medium=cpc&utm_campaign=123&utm_content=ad_456&utm_term=фото+текста&yclid=123456789", "/table-from-photo?intent=tables&utm_source=yandex", "/account?utm_campaign=return", "/guest-documents/123?utm_source=test"]) {
    const f=fixture();f.win.location.href=f.win.location.origin+path;
    f.controller.sync();assert.equal(f.scripts.length,0);
    f.controller.chooseConsent(true);assert.equal(f.scripts.length,1,path);
    assert.equal(f.controller.isPrivateTransition(path),false,path);
  }
});

test("ad support keeps login secrets, malformed labels and admin URLs excluded", () => {
  const origin="https://word2you.ru";
  for (const path of ["/?email=secret@example.test", "/?code=123456", "/?token=secret", "/?utm_source=yandex&code=123456", "/?utm_term=secret%40example.test", "/?utm_source=https%3A%2F%2Fprivate.test", "/?yclid=secret", "/?utm_source=a&utm_source=b", "/admin-control?utm_source=yandex"])assert.equal(isInspectletUrlSafe(path,origin),false,path);
});
