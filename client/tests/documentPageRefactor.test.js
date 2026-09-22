import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../src/components/DocumentPage.jsx", import.meta.url);
const variantsUrl = new URL("../src/components/DocumentTextVariants.jsx", import.meta.url);

test("keeps text tabs, formatted content and corrections outside DocumentPage", async () => {
  const [pageSource, variantsSource] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(variantsUrl, "utf8")
  ]);

  assert.match(pageSource, /<DocumentTextVariants/);
  assert.doesNotMatch(pageSource, /setTextTabSelection|function TextCorrections|function FormattedContent/);
  assert.match(variantsSource, /Варианты текста/);
  assert.match(variantsSource, /Сделаны замены:/);
  assert.match(variantsSource, /Оформленный вариант доступен после входа/);
});
