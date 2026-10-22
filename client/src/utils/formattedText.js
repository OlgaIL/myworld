export function capitalizeFormattedLine(value) {
  const text = String(value || "");

  return text.replace(/^(\s*[«„"'([{]*\s*)(\p{L})/u, (_, prefix, letter) => (
    `${prefix}${letter.toLocaleUpperCase("ru-RU")}`
  ));
}

export function getFormattedList(block) {
  const items = Array.isArray(block?.items) ? block.items.map((item) => String(item || "")) : [];
  const numberedItems = items.map((item) => item.match(/^\s*(\d{1,3})(?:[.)]\s*|\s+)(.+)$/u));
  const hasSequentialMarkers = items.length > 0
    && numberedItems.every(Boolean)
    && numberedItems.every((match, index) => (
      index === 0 || Number(match[1]) === Number(numberedItems[index - 1][1]) + 1
    ));
  const ordered = block?.ordered === true || (block?.ordered !== false && hasSequentialMarkers);
  const inferredStart = hasSequentialMarkers ? Number(numberedItems[0][1]) : 1;
  const explicitStart = Number.isInteger(block?.start) && block.start > 0 ? block.start : inferredStart;

  return {
    ordered,
    start: block?.ordered === true ? explicitStart : inferredStart,
    items: ordered && hasSequentialMarkers
      ? items.map((item, index) => numberedItems[index]?.[2] || item)
      : items
  };
}

// Stored lists remain flat blocks with string items. A level attaches a list
// to the last item of the preceding parent; old documents have level zero.
export function nestFormattedLists(blocks = []) {
  const result = [];
  const parents = [];
  for (const block of blocks) {
    if (block.type !== "list") {
      result.push(block);
      parents.length = 0;
      continue;
    }
    const requestedLevel = Number.isInteger(block.level) && block.level > 0 && block.level <= 2 ? block.level : 0;
    const level = requestedLevel && parents[requestedLevel - 1] ? requestedLevel : 0;
    const list = { ...block, nestedLists: [] };
    if (level) parents[level - 1].nestedLists.push(list);
    else result.push(list);
    parents[level] = list;
    parents.length = level + 1;
  }
  return result;
}

export function normalizeFormattedTypography(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[\t\f\v\u00a0 ]+/g, " "))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/,(?=[^\s\d])/gu, ", ")
    .replace(/;(?=\S)/gu, "; ")
    .replace(/:(?=[^\s\d/\\])/gu, ": ")
    .replace(/([!?])(?=[\p{L}«„"'])/gu, "$1 ")
    .replace(/\.(?=[А-ЯЁA-Z«„"'])/gu, ". ")
    .replace(/([«([{])\s+/g, "$1")
    .replace(/\s+([»)\]}])/g, "$1")
    .trim();
}

export function formatFormattedLine(value) {
  return capitalizeFormattedLine(normalizeFormattedTypography(value));
}

function isLikelyManualHeading(line, hasFollowingLine) {
  if (!hasFollowingLine || line.length > 60 || /[:]/.test(line) || /[.,;!?]$/.test(line) || /\d/.test(line)) {
    return false;
  }

  const words = line.split(/\s+/).filter(Boolean);
  return words.length > 0
    && words.length <= 5
    && /^\p{Lu}/u.test(line);
}

function parseTableCells(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.length >= 2 && cells.every(Boolean) ? cells : null;
}

function isTableDivider(cells, width) {
  return cells?.length === width && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

export function buildManualFormattedContent(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const blocks = [];
  let listItems = [];
  let listOrdered = false;
  let listStart = 1;
  let listLevel = 0;

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({
        type: "list",
        items: listItems,
        ...(listOrdered ? { ordered: true } : {}),
        ...(listOrdered && listStart !== 1 ? { start: listStart } : {}),
        ...(listLevel ? { level: listLevel } : {})
      });
      listItems = [];
      listOrdered = false;
      listStart = 1;
      listLevel = 0;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      flushList();
      continue;
    }

    const headers = parseTableCells(line);
    if (headers) {
      const hasDivider = isTableDivider(parseTableCells(lines[index + 1] || ""), headers.length);
      const rows = [];
      let rowIndex = index + (hasDivider ? 2 : 1);
      while (rowIndex < lines.length) {
        const row = parseTableCells(lines[rowIndex]);
        if (!row || row.length !== headers.length) break;
        rows.push(row);
        rowIndex += 1;
      }
      if (rows.length >= (hasDivider ? 1 : 2)) {
        flushList();
        blocks.push({ type: "table", headers, rows });
        index = rowIndex - 1;
        continue;
      }
    }

    const listMatch = line.match(/^[-•]\s+(.+)$/u);
    const numberedListMatch = line.match(/^(\d{1,3})[.)]\s+(.+)$/u);
    const indent = lines[index].match(/^\s*/u)[0].replace(/\t/g, "  ").length;
    const requestedLevel = Math.min(2, Math.floor(indent / 2));
    const previousLevel = listItems.length ? listLevel
      : blocks.at(-1)?.type === "list" ? blocks.at(-1).level || 0 : -1;
    const level = requestedLevel <= previousLevel + 1 ? requestedLevel : 0;
    if (listMatch) {
      if (listItems.length > 0 && (listOrdered || listLevel !== level)) {
        flushList();
      }
      listLevel = level;
      listItems.push(listMatch[1]);
      continue;
    }

    if (numberedListMatch) {
      if (listItems.length > 0 && (!listOrdered || listLevel !== level)) {
        flushList();
      }
      listLevel = level;
      listOrdered = true;
      if (listItems.length === 0) {
        listStart = Number(numberedListMatch[1]);
      }
      listItems.push(numberedListMatch[2]);
      continue;
    }

    flushList();
    const hasFollowingLine = lines.slice(index + 1).some(Boolean);
    blocks.push({
      type: isLikelyManualHeading(line, hasFollowingLine) ? "heading" : "paragraph",
      text: line
    });
  }
  flushList();

  return blocks.length > 0 ? { blocks } : null;
}
