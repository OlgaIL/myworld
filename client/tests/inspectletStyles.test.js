import test from "node:test";
import assert from "node:assert/strict";
import { inlineReplayStyles } from "../scripts/inlineReplayStyles.mjs";

test("application CSS is self-contained while fonts and scripts retain their URLs", async () => {
  const html = '<link href="https://fonts.example/style.css" rel="stylesheet"><script src="/assets/a.js"></script><link rel="stylesheet" crossorigin href="/assets/a.css">';
  const result = await inlineReplayStyles(html, async href => {
    assert.equal(href, "/assets/a.css");
    return '.document { color: #344054 } /* $& */';
  });
  assert.ok(result.includes('<style data-word2you-replay-css>.document { color: #344054 } /* $& */</style>'));
  assert.ok(result.includes('href="https://fonts.example/style.css"'));
  assert.ok(result.includes('src="/assets/a.js"'));
  assert.ok(!result.includes('href="/assets/a.css"'));
});

test("build fails on missing CSS, unreadable asset or a style terminator", async () => {
  const link = '<link rel="stylesheet" href="/assets/a.css">';
  await assert.rejects(inlineReplayStyles("<html></html>", async () => ""), /missing/);
  await assert.rejects(inlineReplayStyles(link, async () => { throw new Error("missing asset"); }), /missing asset/);
  await assert.rejects(inlineReplayStyles(link, async () => '</style><script>bad()</script>'), /Unsafe/);
});
