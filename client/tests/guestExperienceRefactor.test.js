import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../src/pages/App.jsx", import.meta.url);
const mainUrl = new URL("../src/main.jsx", import.meta.url);
const experienceUrl = new URL("../src/components/GuestExperience.jsx", import.meta.url);
const homeUrl = new URL("../src/components/GuestHome.jsx", import.meta.url);
const uploadHookUrl = new URL("../src/hooks/useGuestUpload.js", import.meta.url);

test("keeps guest flow outside the main application controller", async () => {
  const [appSource, experienceSource] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(experienceUrl, "utf8")
  ]);

  assert.match(appSource, /<GuestExperience/);
  assert.doesNotMatch(appSource, /<GuestHome|useGuestUpload|activeGuestDocument/);
  assert.match(experienceSource, /activeDocumentId/);
  assert.match(experienceSource, /documents\.find/);
});

test("scrolls to the exact uploaded guest document at every viewport width", async () => {
  const [homeSource, uploadHookSource] = await Promise.all([
    readFile(homeUrl, "utf8"),
    readFile(uploadHookUrl, "utf8")
  ]);

  assert.match(uploadHookSource, /onUploadSuccess\?\.\(processedDocument\)/);
  assert.match(homeSource, /if \(!scrollTargetDocumentId \|\| uploading\)/);
  assert.match(homeSource, /documentRefs\.current\.get\(String\(scrollTargetDocumentId\)\)/);
  assert.match(homeSource, /target\.scrollIntoView/);
  assert.match(homeSource, /scrollTargetDocumentId, uploading/);
  assert.doesNotMatch(homeSource, /max-width:\s*700px/);
});

test("opens a guest document at the top with browser history", async () => {
  const [mainSource, experienceSource] = await Promise.all([
    readFile(mainUrl, "utf8"),
    readFile(experienceUrl, "utf8")
  ]);

  assert.match(mainSource, /path="\/guest-documents\/:guestDocumentId"/);
  assert.match(experienceSource, /useNavigate\(\)/);
  assert.match(experienceSource, /navigate\(`\/guest-documents\/\$\{encodeURIComponent\(document\.id\)\}`\)/);
  assert.match(experienceSource, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(experienceSource, /navigate\(-1\)/);
});
