import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

function snapshot(overrides = {}) {
  const code = `globalThis.__myworldEnvLoaded=true;
    const p=await import('./services/processingPipelineService.js');
    const {getAdminSettings}=await import('./routes/adminRoutes.js');
    const {getProcessingGuardError}=await import('./utils/photos.js');
    const result={guest:p.getProcessingPipelineForUser(null,{audience:'guest'}),free:p.getProcessingPipelineForUser({}, {audience:'free'}),paid:p.getProcessingPipelineForUser({}, {audience:'paid'}),settings:getAdminSettings().processing.providers.timeweb};
    result.guard=getProcessingGuardError({processingEnabled:true},result.paid);
    console.log(JSON.stringify(result));`;
  const env = { ...process.env, DATABASE_URL: "", PROCESSING_MODE_OVERRIDE: "standard", PROCESSING_STANDARD_AI_PROVIDER: "timeweb",
    PROCESSING_GUEST_AI_PROVIDER: "", PROCESSING_FREE_AI_PROVIDER: "", PROCESSING_PAID_AI_PROVIDER: "",
    PROCESSING_STANDARD_OCR_PROVIDER: "google", PROCESSING_GUEST_OCR_PROVIDER: "", PROCESSING_FREE_OCR_PROVIDER: "", PROCESSING_PAID_OCR_PROVIDER: "",
    PROCESSING_ENABLED: "true", GOOGLE_OCR_ENABLED: "true", PROCESSING_ALLOWLIST_EMAILS: "",
    TIMEWEB_AI_ENABLED: "true", TIMEWEB_API_KEY: "synthetic-secret", TIMEWEB_MODEL: "openai/gpt-4.1-mini", ...overrides };
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: new URL("..", import.meta.url), env, encoding: "utf8", windowsHide: true }));
}
test("all audiences inherit timeweb, keep Google OCR, and safe settings", () => {
  const result = snapshot();
  for (const audience of ["guest", "free", "paid"]) {
    assert.equal(result[audience].aiProvider, "timeweb");
    assert.equal(result[audience].ocrProvider, "google");
    assert.equal(result[audience].audience, audience);
  }
  assert.equal(result.settings.model, "openai/gpt-4.1-mini");
  assert.equal(result.settings.configured, true);
  assert.equal(result.guard, null);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|apiKey/);
});
test("explicit audience providers override the standard default", () => {
  const result = snapshot({ PROCESSING_GUEST_AI_PROVIDER: "openai", PROCESSING_FREE_AI_PROVIDER: "yandex", PROCESSING_PAID_AI_PROVIDER: "timeweb" });
  assert.equal(result.guest.aiProvider, "openai"); assert.equal(result.free.aiProvider, "yandex"); assert.equal(result.paid.aiProvider, "timeweb");
});
test("fast always remains OpenAI; disabled Timeweb is guarded", () => {
  const fast = snapshot({ PROCESSING_MODE_OVERRIDE: "fast" });
  for (const audience of ["guest", "free", "paid"]) assert.equal(fast[audience].aiProvider, "openai");
  assert.equal(snapshot({ TIMEWEB_AI_ENABLED: "false" }).guard, "TIMEWEB_AI_DISABLED");
});
test("UI labels timeweb independently in metrics and settings", () => {
  const admin = fs.readFileSync(new URL("../../client/src/pages/AdminPage.jsx", import.meta.url), "utf8");
  assert.match(admin, /timeweb: "Timeweb"/);
});
test("health exposes safe Timeweb settings and accurate audience pipelines without a gateway request", () => {
  const code = `globalThis.__myworldEnvLoaded=true;
    const {createApp}=await import('./app.js'); const app=createApp();
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    try {console.log(JSON.stringify(await (await fetch('http://127.0.0.1:'+server.address().port+'/api/health')).json()));}
    finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}`;
  const env = { ...process.env, DATABASE_URL: "", TIMEWEB_AI_ENABLED: "true", TIMEWEB_API_KEY: "synthetic-health-secret",
    TIMEWEB_BASE_URL: "http://127.0.0.1:9/v1", TIMEWEB_MODEL: "openai/gpt-4.1-mini", PROCESSING_MODE_OVERRIDE: "standard",
    PROCESSING_STANDARD_AI_PROVIDER: "timeweb", PROCESSING_GUEST_AI_PROVIDER: "timeweb", PROCESSING_FREE_AI_PROVIDER: "timeweb", PROCESSING_PAID_AI_PROVIDER: "timeweb" };
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: new URL("..", import.meta.url), env, encoding: "utf8", windowsHide: true });
  const result = JSON.parse(output);
  assert.equal(result.processing.providers.timeweb.model, "openai/gpt-4.1-mini");
  assert.equal(result.processing.providers.timeweb.configured, true);
  for (const audience of ["guest", "free", "paid"]) assert.equal(result.processing.pipelines[audience].audience, audience);
  assert.doesNotMatch(output, /synthetic-health-secret|apiKey/);
});
