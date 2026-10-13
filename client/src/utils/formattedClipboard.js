import { formatFormattedLine, getFormattedList } from "./formattedText.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function getFormattedText(content) {
  return (content?.blocks || []).map((block) => {
    if (block.type === "table") {
      return [block.headers, ...block.rows]
        .map((row) => row.map(formatFormattedLine).join("\t")).join("\n");
    }
    if (block.type === "list") {
      const list = getFormattedList(block);
      return list.items.map((item, index) => (
        list.ordered ? `${list.start + index}. ${formatFormattedLine(item)}` : `- ${formatFormattedLine(item)}`
      )).join("\n");
    }
    return formatFormattedLine(block.text);
  }).filter(Boolean).join("\n\n");
}

export function getFormattedHtml(content) {
  const blocks = (content?.blocks || []).map((block) => {
    if (block.type === "table") {
      const cell = (tag, value) => `<${tag} style="border:1px solid #777;padding:6px 8px;text-align:left;">${escapeHtml(value)}</${tag}>`;
      const headers = block.headers.map((value) => cell("th", value)).join("");
      const rows = block.rows.map((row) => `<tr>${row.map((value) => cell("td", value)).join("")}</tr>`).join("");
      return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (block.type === "list") {
      const list = getFormattedList(block);
      const tag = list.ordered ? "ol" : "ul";
      const start = list.ordered ? ` start="${list.start}"` : "";
      return `<${tag}${start}>${list.items.map((item) => `<li>${escapeHtml(formatFormattedLine(item))}</li>`).join("")}</${tag}>`;
    }
    const tag = block.type === "heading" ? "h3" : "p";
    return `<${tag}>${escapeHtml(formatFormattedLine(block.text))}</${tag}>`;
  }).join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${blocks}</body></html>`;
}

export async function writeClipboardContent(text, { html } = {}, environment = globalThis) {
  const clipboard = environment.navigator?.clipboard;
  if (html) {
    if (!clipboard?.write || !environment.ClipboardItem) {
      throw Object.assign(new Error("Rich clipboard is unavailable"), { code: "RICH_CLIPBOARD_UNAVAILABLE" });
    }
    await clipboard.write([new environment.ClipboardItem({
      "text/plain": new environment.Blob([text], { type: "text/plain" }),
      "text/html": new environment.Blob([html], { type: "text/html" })
    })]);
  } else {
    await clipboard.writeText(text);
  }
}
