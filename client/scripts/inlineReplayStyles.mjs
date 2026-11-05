// Keep application CSS in the recorded DOM. Playback must not depend on a
// stylesheet fetch, the CSS crawler, or a previous deployment's hashed assets.
export async function inlineReplayStyles(html, readAsset) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)];
  let count = 0;
  for (const [link] of links) {
    if (!/\brel=["']stylesheet["']/i.test(link)) continue;
    const href = link.match(/\bhref=["'](\/assets\/[^"']+\.css)["']/i)?.[1];
    if (!href) continue; // External fonts retain their normal fallback behavior.
    const css = await readAsset(href);
    // Fail closed if generated CSS could terminate the HTML style element.
    if (/<\/style/i.test(css)) throw new Error("Unsafe inline stylesheet");
    html = html.replace(link, () => `<style data-word2you-replay-css>${css}</style>`);
    count++;
  }
  if (!count) throw new Error("Application stylesheet missing from built HTML");
  return html;
}
