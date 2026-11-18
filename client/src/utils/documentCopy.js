import { getFormattedHtml } from "./formattedClipboard.js";

// Inputs come directly from each rendered DocumentTextVariants instance. This
// keeps manual improvements, corrections and table formatting identical to the
// existing page-copy button, instead of deriving a second text representation.
export function combineDocumentCopy(variants) {
  const ready=variants.filter(v=>v?.text?.trim());
  const text=ready.map(v=>v.text).join("\n\n");
  if(!ready.some(v=>v.html))return {text};
  const body=ready.map(v=>{
    const html=v.html||getFormattedHtml({blocks:[{type:"paragraph",text:v.text}]});
    return html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]||html;
  }).join("<p><br></p>");
  return {text,html:`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`};
}
