import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../src/components/GuestDocumentSaveCta.jsx", import.meta.url);
const documentPageUrl = new URL("../src/components/DocumentPage.jsx", import.meta.url);
const packageOfferUrl = new URL("../src/components/ProcessingPackageOffer.jsx", import.meta.url);
const appUrl = new URL("../src/pages/App.jsx", import.meta.url);

test("uses the approved guest result CTA copy without prohibited promises", async () => {
  const source = await readFile(componentUrl, "utf8");

  assert.match(source, /Сохраните текст — откройте его на любом устройстве/);
  assert.match(source, /Ещё 10 обработок после входа · карта не нужна/);
  assert.match(source, /providers\.map\(\(provider\)/);
  assert.match(source, /source: "guest_result_cta"/);
  assert.match(source, /placement: "document_after_result"/);
  assert.doesNotMatch(source, /providers\[0\]|guest-document-save-cta__primary/);
  assert.doesNotMatch(source, /30 обработок|редактировать/i);
});

test("shows the post-auth step without opening the file chooser automatically", async () => {
  const [documentPage, app] = await Promise.all([
    readFile(documentPageUrl, "utf8"),
    readFile(appUrl, "utf8")
  ]);

  assert.match(documentPage, /Обработать ещё фото/);
  assert.match(documentPage, /post_auth_process_another_view/);
  assert.match(documentPage, /post_auth_process_another_click/);
  assert.match(app, /const handlePostAuthProcessAnother[\s\S]*?closeDocument\(\);[\s\S]*?\}, \[closeDocument\]\);/);
});

test("deduplicates package views and tracks a reached limit only at zero", async () => {
  const source = await readFile(packageOfferUrl, "utf8");

  assert.match(source, /trackGoalOnce\([\s\S]*?"package_offer_view"[\s\S]*?offerTrigger[\s\S]*?offerRemaining/);
  assert.match(source, /if \(offerRemaining === 0 && user\?\.id\)[\s\S]*?trackGoalOnce\("free_limit_reached"/);
  assert.doesNotMatch(source, /offerRemaining\s*<=\s*3[\s\S]*?free_limit_reached/);
});
