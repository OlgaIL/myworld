// Local acceptance harness. React components and hooks are real; every HTTP
// request is intercepted by an in-memory Axios adapter. No browser is controlled.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const clientRoot = fileURLToPath(new URL("../../client/", import.meta.url));
const requireClient = createRequire(new URL("../../client/package.json", import.meta.url));
const requireRenderer = createRequire(new URL("../batch-promo-test-runtime/package.json", import.meta.url));
const React = requireClient("react");
requireClient.cache[requireRenderer.resolve("react")] = requireClient.cache[requireClient.resolve("react")];
const { create, act } = requireRenderer("react-test-renderer");
const { createServer } = await import(pathToFileURL(requireClient.resolve("vite")));
const { default: reactPlugin } = await import(pathToFileURL(requireClient.resolve("@vitejs/plugin-react")));
const { default: axios } = await import(pathToFileURL(requireClient.resolve("axios").replace(/dist[\\/]node[\\/]axios.cjs$/, "index.js")));
const committedNeighbors = process.argv.includes("--committed-neighbors");
const neighborFiles = new Set(["src/components/DocumentPage.jsx", "src/components/DocumentTextVariants.jsx", "src/components/GuestDocumentSaveCta.jsx", "src/index.css", "src/utils/formattedText.js", "src/utils/packageOffer.js"]);
const neighborPlugin = { name: "committed-neighbors-in-memory", enforce: "pre", load(id) {
  const relative = id.replaceAll("\\", "/").replace(clientRoot.replaceAll("\\", "/"), "");
  if (committedNeighbors && neighborFiles.has(relative)) return execFileSync("git", ["show", `HEAD:client/${relative}`], { cwd: clientRoot, encoding: "utf8" });
} };
const server = await createServer({ root: clientRoot, configFile: false, plugins: [neighborPlugin, reactPlugin()], define: { "import.meta.env.PROD": true }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), clear: () => values.clear() };
};
const sessionStorage = storage(), localStorage = storage();
const eventTarget = new EventTarget();
globalThis.window = {
  sessionStorage, localStorage, location: { pathname: "/", search: "", href: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener: (...args) => eventTarget.addEventListener(...args),
  removeEventListener: (...args) => eventTarget.removeEventListener(...args),
  dispatchEvent: (...args) => eventTarget.dispatchEvent(...args),
  matchMedia: () => ({ matches: true }), requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
  scrollTo() {}
};
globalThis.localStorage = localStorage;
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {}, querySelector: () => null };
globalThis.alert = message => { throw Error(`Unexpected alert: ${message}`); };
const user = { id: "synthetic-batch", displayName: "Учебный кабинет", recordLimit: 10, recordsUsed: 0,
  packageRemaining: 10, processingAllowed: true, recordUploadAllowed: true, legalVersion: "2026-07-15", legalAcceptedAt: "2026-11-07" };
let currentUser = null, guestDocuments = [], requests = [], goals = [], invalidCode = false, requestFailure = false, auth, route, root, pickerClicks = 0, uploads = 0, processing = 0;
window.ym = (_id, operation, ...args) => {
  if (operation === "getClientID") args[0]("123456789");
  if (operation === "reachGoal") goals.push({ name: args[0], params: args[1] });
};
axios.defaults.adapter = async config => {
  const path = new URL(config.url, "http://localhost").pathname;
  const payload = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  requests.push({ path, payload });
  let data;
  if (path === "/api/me") data = currentUser;
  else if (path === "/api/auth-providers") data = [{ id: "yandex", label: "Яндекс" }, { id: "email", label: "Email" }];
  else if (path === "/api/guest/document") data = { documents: guestDocuments, access: { uploadAllowed: true, documentLimit: 5, documentsUsed: guestDocuments.length } };
  else if (path === "/api/photos-metadata" || path === "/api/improvement-requests" || path.endsWith("/improvement-requests")) data = [];
  else if (path === "/api/auth/email/request") {
    if (requestFailure) throw Error("Synthetic email unavailable");
    data = { retryAfterSeconds: 60 };
  } else if (path === "/api/auth/email/verify") {
    if (invalidCode) throw Error("Synthetic invalid code");
    currentUser = user; data = { ok: true };
  } else if (path === "/api/acquisition" || path === "/api/analytics/identity") data = { ok: true };
  else if (path === "/api/upload") { uploads += 1; data = { filename: `synthetic-${uploads}.jpg` }; }
  else if (path.endsWith("/process")) { processing += 1; data = { status: "processed" }; }
  else if (path.endsWith("/tables")) data = { tables: [] };
  else throw Error(`UNMOCKED_REQUEST: ${path}`);
  return { data, status: 200, statusText: "OK", headers: {}, config };
};
const { AuthProvider, useAuthContext } = await server.ssrLoadModule("/src/contexts/AuthContext.jsx");
const { default: App } = await server.ssrLoadModule("/src/pages/App.jsx");
const { default: FeatureLanding } = await server.ssrLoadModule("/src/pages/FeatureLanding.jsx");
const flow = await server.ssrLoadModule("/src/utils/batchFlow.js");
const analytics = await server.ssrLoadModule("/src/services/analytics.js");
const { MemoryRouter, Routes, Route, useLocation, useNavigate } = await import(pathToFileURL(requireClient.resolve("react-router-dom")));
let navigate;
function Probe() { auth = useAuthContext(); route = useLocation(); navigate = useNavigate(); return null; }
const h = React.createElement;
const text = node => typeof node === "string" ? node : (node?.children || []).map(text).join("");
const buttons = label => root.root.findAll(node => node.type === "button" && text(node).includes(label));
const batchPanels = () => root.root.findAll(node => node.type === "section" && (node.props.className || "").split(" ").includes("batch-upload-entry"));
const batchUploadReady = () => {
  assert.equal(batchPanels().length, 0);
  assert.ok(root.root.findAll(node => ["p", "span"].includes(node.type) && text(node).includes("Каждое фото — отдельная обработка и запись.")).length > 0);
};
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); };
async function mount(path, { keepSession = false, loggedIn = false, docs = [] } = {}) {
  if (root) await act(async () => root.unmount());
  if (!keepSession) { sessionStorage.clear(); localStorage.clear(); }
  localStorage.setItem("word2you_legal_agreement_accepted_2026-07-15", "2026-07-15");
  guestDocuments = docs; currentUser = loggedIn ? user : null; invalidCode = false; requestFailure = false;
  pickerClicks = uploads = processing = 0; requests = []; goals = [];
  const url = new URL(path, "http://localhost"); window.location = { pathname: url.pathname, search: url.search, href: "" };
  await act(async () => {
    root = create(h(React.StrictMode, null, h(MemoryRouter, { initialEntries: [path] }, h(AuthProvider, null,
      h(Probe), h(Routes, null,
        h(Route, { path: "/", element: h(App) }),
        h(Route, { path: "/guest-documents/:guestDocumentId", element: h(App) }),
        h(Route, { path: "/batch-photo-to-text", element: h(FeatureLanding, { kind: "batch" }) })
      )))), { createNodeMock: element => ({ click() { if (element.type === "input") pickerClicks += 1; }, focus() {}, scrollIntoView() {} }) });
  });
  await flush();
}
const click = async button => { await act(async () => { await button.props.onClick(); }); await flush(); };
const noAutomaticWork = () => { assert.equal(pickerClicks, 0); assert.equal(uploads, 0); assert.equal(processing, 0); };
let passed = 0;
async function check(name, callback) { await callback(); console.log(`PASS ${++passed}: ${name}`); }
try {
  await check("guest promo: both placements offer batch login and a distinct single-photo route", async () => {
    await mount("/batch-photo-to-text");
    const links = root.root.findAll(node => node.type === "a");
    assert.equal(links.filter(node => text(node) === "Войти и загрузить несколько фото").length, 2);
    assert.equal(links.filter(node => node.props.href === flow.BATCH_TRIAL_PATH).length, 2);
    noAutomaticWork();
  });
  await check("authenticated promo labels the direct batch action", async () => {
    await mount("/batch-photo-to-text", { loggedIn: true });
    assert.equal(root.root.findAll(node => node.type === "a" && text(node) === "Загрузить несколько фото").length, 2);
  });
  await check("promo CTA events distinguish both choices and preserve placement", async () => {
    for (const placement of ["batch_hero", "batch_final"]) {
      for (const action of ["multiple", "single"]) {
        await mount("/batch-photo-to-text");
        const label = action === "multiple" ? "Войти и загрузить несколько фото" : "Сначала попробовать одно фото без входа";
        const links = root.root.findAll(node => node.type === "a" && text(node) === label);
        const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        await act(async () => links[placement === "batch_hero" ? 0 : 1].props.onClick(event)); await flush();
        const goal = goals.find(item => item.name === "batch_promo_cta_click");
        assert.equal(goal.params.action, action); assert.equal(goal.params.placement, placement);
      }
    }
  });
  await check("email login: retry invalid code, preserve source, show picker button without opening files", async () => {
    await mount("/?intent=batch&placement=batch_final&utm_source=yandex&utm_campaign=synthetic&yclid=123");
    analytics.captureAcquisitionContext("batch_photo_to_text"); analytics.rememberMetrikaClientId("123456789");
    await click(buttons("Email")[0]);
    assert.equal(flow.getPendingBatchUpload().placement, "batch_final");
    requestFailure = true;
    await act(async () => assert.rejects(auth.requestEmailLoginCode("synthetic@example.invalid")));
    requestFailure = false;
    await act(async () => auth.requestEmailLoginCode("synthetic@example.invalid"));
    invalidCode = true;
    await act(async () => assert.rejects(auth.verifyEmailLoginCode("synthetic@example.invalid", "000000")));
    assert.equal(auth.emailAuthOpen, true); noAutomaticWork();
    invalidCode = false;
    await act(async () => auth.verifyEmailLoginCode("synthetic@example.invalid", "123456")); await flush();
    batchUploadReady();
    assert.equal(flow.getPendingBatchUpload(), null);
    assert.equal(new URLSearchParams(route.search).has("intent"), false);
    const emailRequest = requests.find(request => request.path === "/api/auth/email/request" && request.payload);
    assert.equal(emailRequest.payload.acquisitionContext.utm_source, "yandex");
    assert.equal(emailRequest.payload.analyticsIdentity.metrikaClientId, "123456789");
    assert.equal(analytics.getAcquisitionContext().yclid, "123");
    const completedAuth = goals.find(item => item.name === "account_authenticated");
    assert.equal(completedAuth.params.source, "batch_promo"); assert.equal(completedAuth.params.placement, "batch_final");
    noAutomaticWork();
    await click(root.root.findAll(node => node.type === "button" && (node.props.className === "upload-zone" || text(node) === "Загрузить фото"))[0]); assert.equal(pickerClicks, 1);
    const input = root.root.findAll(node => node.type === "input" && node.props.type === "file")[0];
    assert.equal(input.props.multiple, true);
    await act(async () => input.props.onCancel()); assert.equal(batchPanels().length, 0);
  });
  await check("OAuth-like reload consumes original placement once; reload does not reopen the prompt", async () => {
    await mount("/?intent=batch&placement=batch_hero&utm_source=yandex&utm_content=synthetic");
    analytics.captureAcquisitionContext("batch_photo_to_text"); analytics.rememberMetrikaClientId("123456789");
    await click(buttons("Яндекс")[0]);
    assert.match(window.location.href, /\/auth\/yandex$/);
    assert.equal(requests.find(request => request.path === "/api/acquisition").payload.context.utm_content, "synthetic");
    await mount("/", { keepSession: true, loggedIn: true });
    batchUploadReady(); assert.equal(flow.getPendingBatchUpload(), null); noAutomaticWork();
    await mount("/", { keepSession: true, loggedIn: true }); assert.equal(batchPanels().length, 0); noAutomaticWork();
  });
  await check("authenticated direct route, manual upload, two-file selection and mock processing", async () => {
    await mount("/?intent=batch&placement=batch_hero", { loggedIn: true });
    batchUploadReady(); noAutomaticWork();
    const input = root.root.findAll(node => node.type === "input" && node.props.type === "file")[0];
    const files = [new File(["synthetic"], "one.png", { type: "image/png" }), new File(["synthetic"], "two.png", { type: "image/png" })];
    await act(async () => input.props.onChange({ target: { files, value: "synthetic" } })); await flush();
    assert.equal(uploads, 2); assert.equal(processing, 2); assert.equal(batchPanels().length, 0);
    const selection = goals.filter(item => item.name === "account_batch_selected");
    assert.equal(selection.length, 1); assert.equal(selection[0].params.file_count, 2);
    assert.equal(selection[0].params.source, "batch_promo"); assert.equal(selection[0].params.placement, "batch_hero");
    const results = goals.filter(item => item.name === "account_upload_success");
    assert.equal(results.length, 2); assert.equal(results[0].params.file_count, 2);
    assert.equal(results[0].params.batch_source, "batch_promo");
    assert.equal(results[0].params.batch_placement, "batch_hero");
    assert.ok(!JSON.stringify(selection.concat(results)).includes("one.png"));
    assert.ok(!JSON.stringify(selection.concat(results)).includes("two.png"));
  });
  await check("one selected file is not counted as a batch; record limits remain enforced", async () => {
    await mount("/?intent=batch", { loggedIn: true });
    const input = root.root.findAll(node => node.type === "input" && node.props.type === "file")[0];
    await act(async () => input.props.onChange({ target: { files: [new File(["x"], "one.png", { type: "image/png" })], value: "synthetic" } }));
    assert.equal(uploads, 1); assert.equal(processing, 1);
    assert.equal(goals.filter(item => item.name === "account_batch_selected").length, 0);
    await mount("/?intent=batch", { loggedIn: true });
    currentUser = { ...user, recordUploadAllowed: false };
    await act(async () => auth.reloadUser()); await flush();
    assert.equal(root.root.findAll(node => node.type === "input" && node.props.type === "file")[0].props.disabled, true); noAutomaticWork();
  });
  await check("a new explicit batch choice takes precedence over an older pending return", async () => {
    await mount("/");
    flow.rememberPendingBatchUpload({ source: "batch_trial", placement: "batch_trial_result" });
    await mount("/?intent=batch&placement=batch_final", { keepSession: true, loggedIn: true });
    const input = root.root.findAll(node => node.type === "input" && node.props.type === "file")[0];
    const files = [new File(["x"], "one.png", { type: "image/png" }), new File(["x"], "two.png", { type: "image/png" })];
    await act(async () => input.props.onChange({ target: { files, value: "synthetic" } }));
    const event = goals.find(item => item.name === "account_batch_selected");
    assert.equal(event.params.source, "batch_promo"); assert.equal(event.params.placement, "batch_final");
    assert.equal(flow.getPendingBatchUpload(), null);
  });
  await check("email cancellation and ordinary later login do not resurrect intent", async () => {
    await mount("/?intent=batch&placement=batch_final"); await click(buttons("Email")[0]);
    await act(async () => auth.closeEmailAuth()); assert.equal(flow.getPendingBatchUpload(), null);
    await click(buttons("Сначала попробовать одно фото без входа")[0]);
    assert.equal(batchPanels().length, 0);
    await act(async () => auth.loginWithProvider("email", { source: "header_login", placement: "header" }));
    await act(async () => auth.verifyEmailLoginCode("synthetic@example.invalid", "123456")); await flush();
    assert.equal(batchPanels().length, 0); noAutomaticWork();
  });
  await check("OAuth error and aborted return require a manual retry; no redirect loop", async () => {
    await mount("/?intent=batch&placement=batch_hero"); await click(buttons("Яндекс")[0]);
    await mount("/?auth_error=oauth_failed", { keepSession: true });
    assert.equal(flow.getPendingBatchUpload(), null); assert.equal(batchPanels().length, 1); noAutomaticWork();
    assert.equal(window.location.href, "");
    await click(buttons("Сначала попробовать одно фото без входа")[0]); assert.equal(batchPanels().length, 0);
    await mount("/?intent=batch"); await click(buttons("Яндекс")[0]);
    await mount("/", { keepSession: true }); assert.equal(batchPanels().length, 0); assert.equal(flow.getPendingBatchUpload(), null);
  });
  const doc = { id: 999, filename: "synthetic-guest.jpg", status: "processed", cleanText: "Учебный текст", text: "Учебный текст", hasTable: true };
  await check("targeted single-photo trial result routes its existing CTA to batch after email", async () => {
    await mount("/guest-documents/999?intent=batch-trial", { docs: [doc] });
    if (buttons("Обработать несколько фото").length) await click(buttons("Обработать несколько фото")[0]);
    await click(buttons("Продолжить по email")[0]);
    assert.deepEqual(flow.getPendingBatchUpload(), { source: "batch_trial", placement: "batch_trial_result" });
    await act(async () => auth.verifyEmailLoginCode("synthetic@example.invalid", "123456")); await flush();
    assert.equal(route.pathname, "/"); batchUploadReady(); noAutomaticWork();
  });
  await check("trial result also offers an explicit batch continuation without changing the general result", async () => {
    await mount("/guest-documents/999?intent=batch-trial", { docs: [doc] });
    const link = root.root.find(node => node.type === "a" && node.props.href === flow.batchUploadPath("batch_trial_result"));
    const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    await act(async () => link.props.onClick(event)); await flush();
    assert.equal(route.pathname, "/"); assert.equal(batchPanels().length, 1);
    await click(buttons("Email")[0]);
    assert.deepEqual(flow.getPendingBatchUpload(), { source: "batch_trial", placement: "batch_trial_result" });
    noAutomaticWork();
  });
  await check("ordinary guest result keeps its document handoff and does not become a batch intent", async () => {
    await mount("/guest-documents/999", { docs: [doc] });
    if (buttons("Обработать несколько фото").length) await click(buttons("Обработать несколько фото")[0]);
    await click(buttons("Продолжить по email")[0]);
    assert.equal(flow.getPendingBatchUpload(), null);
    assert.ok(sessionStorage.getItem("word2you_pending_guest_result"));
  });
  await check("ordinary guest and table upload routes retain a single file input", async () => {
    for (const path of ["/", "/?intent=tables", "/?intent=batch-trial"]) {
      await mount(path);
      const input = root.root.findAll(node => node.type === "input" && node.props.type === "file")[0];
      assert.equal(input.props.multiple, undefined); assert.equal(batchPanels().length, 0); noAutomaticWork();
    }
  });
  await check("table restore from the batch trial remains a table-only action", async () => {
    await mount("/guest-documents/999?intent=batch-trial", { docs: [doc] });
    const variants = root.root.find(node => typeof node.type === "function" && node.type.name === "DocumentTextVariants");
    await act(async () => variants.props.onProviderLogin("email", { source: "guest_table_restore", restoreTables: true }));
    assert.equal(flow.getPendingBatchUpload(), null);
    assert.ok(sessionStorage.getItem("word2you_pending_table_restore"));
    noAutomaticWork();
  });
  console.log(`RESULT: ${passed} acceptance scenarios passed; HTTP adapter intercepted every request; committed neighbors: ${committedNeighbors}.`);
} finally {
  if (root) await act(async () => root.unmount());
  await server.close();
}
