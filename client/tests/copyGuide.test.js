import assert from "node:assert/strict";
import test from "node:test";
import {
  COPY_GUIDE_STORAGE_KEY,
  hasUsedCopyButton,
  rememberCopyButtonUse
} from "../src/utils/copyGuide.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

test("remembers the first successful copy in browser storage", () => {
  const storage = createStorage();

  assert.equal(hasUsedCopyButton(storage), false);
  rememberCopyButtonUse(storage);
  assert.equal(storage.getItem(COPY_GUIDE_STORAGE_KEY), "true");
  assert.equal(hasUsedCopyButton(storage), true);
});

test("keeps the guide available when browser storage is blocked", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    }
  };

  assert.equal(hasUsedCopyButton(storage), false);
  assert.doesNotThrow(() => rememberCopyButtonUse(storage));
});
