const normalized = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU")
  .replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function promoteDocumentTitle(content, title) {
  if (!Array.isArray(content?.blocks) || String(title || "").trim().length < 12) return content;
  const heading = String(title).trim();
  const index = content.blocks.findIndex((block) => {
    if (block.type !== "paragraph") return false;
    const text = String(block.text || "").trim();
    return text.toLocaleLowerCase("ru-RU").startsWith(heading.toLocaleLowerCase("ru-RU"))
      && (!text[heading.length] || /^[\s:—–.,]/u.test(text[heading.length]));
  });
  if (index < 0) return content;
  const blocks = [...content.blocks];
  const original = String(blocks[index].text || "").trim();
  const rest = original.slice(heading.length).replace(/^[\s:—–.]+/u, "").trim();
  blocks.splice(index, 1, { type: "heading", text: original.slice(0, heading.length) },
    ...(rest ? [{ type: "paragraph", text: rest }] : []));
  return { ...content, blocks };
}

function matchesSourceRow(block, row) {
  if (block?.type !== "paragraph") return false;
  const source = normalized(block.text);
  const label = normalized(row[0]);
  if (!label || !(source === label || source.startsWith(`${label} `))) return false;
  const sourceDigits = String(block.text || "").replace(/\D/gu, "");
  return row.slice(1).map((cell) => String(cell || "").replace(/\D/gu, ""))
    .some((digits) => digits.length >= 3 && sourceDigits.includes(digits));
}

function captionNumber(value) {
  return normalized(value).match(/^таблица (\d{1,3})\b/u)?.[1] || null;
}

function tableLikeRow(block) {
  if (!["paragraph", "heading"].includes(block?.type)) return false;
  const text = String(block.text || "");
  return (text.match(/\|/gu) || []).length >= 2
    || (text.length <= 120 && (text.match(/\d+(?:[,.]\d+)?/gu) || []).length >= 2);
}

function findTableRange(blocks, heading, table) {
  const number = captionNumber(heading?.text);
  if (number) {
    const starts = blocks.map((block, index) => captionNumber(block.text) === number ? index : -1)
      .filter((index) => index >= 0);
    if (starts.length !== 1) return null;
    const start = starts[0];
    const headerText = normalized(blocks[start + 1]?.text);
    if (!headerText || headerText.length > 120 || !/(?:^| )(?:наименование|название|всего)(?: |$)/u.test(headerText)) {
      return null;
    }
    let end = start + 2;
    while (end < blocks.length && tableLikeRow(blocks[end])) end++;
    return end - start >= 4 ? { start, end } : null;
  }

  const keys = table.headers.map(normalized).filter((key) => key.length >= 4);
  const starts = blocks.map((block, index) => {
    const text = String(block.text || "");
    const source = normalized(text);
    return block.type === "paragraph" && text.length <= 240
      && keys.filter((key) => source.includes(key)).length >= 2
      && table.rows.every((row, rowIndex) => matchesSourceRow(blocks[index + rowIndex + 1], row))
      ? index : -1;
  }).filter((index) => index >= 0);
  if (starts.length !== 1) return null;
  const headerIndex = starts[0];
  const start = heading && normalized(blocks[headerIndex - 1]?.text) === normalized(heading.text)
    ? headerIndex - 1 : headerIndex;
  return { start, end: headerIndex + table.rows.length + 1 };
}

// Only replace a uniquely located table-shaped span. Uncertain placement stays
// in the separate Tables tab so surrounding prose cannot silently disappear.
export function mergeFormattedTables(formattedContent, tableContent) {
  if (!Array.isArray(formattedContent?.blocks) || !Array.isArray(tableContent?.blocks)) {
    return { content: formattedContent, merged: false };
  }
  if (formattedContent.blocks.some((block) => block.type === "table")) {
    return { content: formattedContent, merged: false };
  }
  const replacements = [];
  const extracted = tableContent.blocks;
  for (let index = 0; index < extracted.length; index++) {
    const heading = extracted[index]?.type === "heading" ? extracted[index] : null;
    const table = heading ? extracted[index + 1] : extracted[index];
    if (table?.type !== "table") return { content: formattedContent, merged: false };
    const range = findTableRange(formattedContent.blocks, heading, table);
    if (!range) return { content: formattedContent, merged: false };
    replacements.push({ ...range, blocks: heading ? [heading, table] : [table] });
    if (heading) index++;
  }
  if (!replacements.length) return { content: formattedContent, merged: false };
  replacements.sort((a, b) => a.start - b.start);
  if (replacements.some((item, index) => index > 0 && item.start < replacements[index - 1].end)) {
    return { content: formattedContent, merged: false };
  }
  const blocks = [...formattedContent.blocks];
  for (const item of replacements.reverse()) {
    blocks.splice(item.start, item.end - item.start, ...item.blocks);
  }
  return { content: { ...formattedContent, blocks }, merged: true };
}
