import { formatFormattedLine, getFormattedList, nestFormattedLists } from "./formattedText.js";
import { getTableHeaderRows } from "./tableHeaders.js";

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
        `${"  ".repeat(block.level || 0)}${list.ordered ? `${list.start + index}.` : "-"} ${formatFormattedLine(item)}`
      )).join("\n");
    }
    return formatFormattedLine(block.text);
  }).filter(Boolean).join("\n\n");
}

function listHtml(block) {
  const list = getFormattedList(block);
  const tag = list.ordered ? "ol" : "ul";
  const start = list.ordered ? ` start="${list.start}"` : "";
  return `<${tag}${start}>${list.items.map((item, index) => `<li>${escapeHtml(formatFormattedLine(item))}${
    index === list.items.length - 1 ? (block.nestedLists || []).map(listHtml).join("") : ""
  }</li>`).join("")}</${tag}>`;
}

export function getFormattedHtml(content) {
  const blocks = nestFormattedLists(content?.blocks).map((block) => {
    if (block.type === "table") {
      const compact=block.headers.length>4;
      const cell = (tag, value, attributes="") => `<${tag}${attributes} style="border:1px solid #777;padding:${compact?'4px 6px':'6px 8px'};text-align:${tag==='th'?'center':'left'};vertical-align:middle;">${escapeHtml(value)}</${tag}>`;
      const headers = getTableHeaderRows(block).map(row=>`<tr>${row.map(header=>cell("th",header.text,
        ` colspan="${header.colSpan}" rowspan="${header.rowSpan}" scope="${header.colSpan>1?'colgroup':'col'}"`)).join("")}</tr>`).join("");
      const rows = block.rows.map((row) => `<tr>${row.map((value) => cell("td", value)).join("")}</tr>`).join("");
      return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:${compact?'9pt':'10.5pt'};"><thead>${headers}</thead><tbody>${rows}</tbody></table>`;
    }
    if (block.type === "list") {
      return listHtml(block);
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
