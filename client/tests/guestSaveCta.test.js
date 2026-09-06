import assert from "node:assert/strict";
import test from "node:test";
import { canShowGuestDocumentSaveCta } from "../src/utils/guestSaveCta.js";

const validState = {
  isAuthenticated: false,
  documentStatus: "processed",
  recognizedText: "Распознанный текст",
  providers: [{ id: "yandex" }],
  onProviderLogin() {}
};

test("shows the save CTA only for a processed guest document with text", () => {
  assert.equal(canShowGuestDocumentSaveCta(validState), true);
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, documentStatus: "recognized" }), true);
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, documentStatus: "claimed" }), true);
});

test("hides the save CTA for authenticated users and unfinished documents", () => {
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, isAuthenticated: true }), false);
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, documentStatus: "processing" }), false);
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, documentStatus: "error" }), false);
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, documentStatus: "no_text" }), false);
});

test("hides the save CTA without text, providers, or a login handler", () => {
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, recognizedText: "  " }), false);
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, providers: [] }), false);
  assert.equal(canShowGuestDocumentSaveCta({ ...validState, onProviderLogin: null }), false);
});
