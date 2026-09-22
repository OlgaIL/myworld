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
  const ordered = block?.ordered === true || hasSequentialMarkers;
  const inferredStart = hasSequentialMarkers ? Number(numberedItems[0][1]) : 1;
  const explicitStart = Number.isInteger(block?.start) && block.start > 0 ? block.start : 1;

  return {
    ordered,
    start: block?.ordered === true ? explicitStart : inferredStart,
    items: ordered
      ? items.map((item, index) => numberedItems[index]?.[2] || item)
      : items
  };
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

export function buildManualFormattedContent(value) {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  const blocks = [];
  let listItems = [];
  let listOrdered = false;
  let listStart = 1;

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({
        type: "list",
        items: listItems,
        ...(listOrdered ? { ordered: true } : {}),
        ...(listOrdered && listStart !== 1 ? { start: listStart } : {})
      });
      listItems = [];
      listOrdered = false;
      listStart = 1;
    }
  }

  lines.forEach((line, index) => {
    if (!line) {
      flushList();
      return;
    }

    const listMatch = line.match(/^[-•]\s+(.+)$/u);
    if (listMatch) {
      if (listItems.length > 0 && listOrdered) {
        flushList();
      }
      listItems.push(listMatch[1]);
      return;
    }

    const numberedListMatch = line.match(/^(\d{1,3})[.)]\s+(.+)$/u);
    if (numberedListMatch) {
      if (listItems.length > 0 && !listOrdered) {
        flushList();
      }
      listOrdered = true;
      if (listItems.length === 0) {
        listStart = Number(numberedListMatch[1]);
      }
      listItems.push(numberedListMatch[2]);
      return;
    }

    flushList();
    const hasFollowingLine = lines.slice(index + 1).some(Boolean);
    blocks.push({
      type: isLikelyManualHeading(line, hasFollowingLine) ? "heading" : "paragraph",
      text: line
    });
  });
  flushList();

  return blocks.length > 0 ? { blocks } : null;
}
