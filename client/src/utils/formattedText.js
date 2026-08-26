export function capitalizeFormattedLine(value) {
  const text = String(value || "");

  return text.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
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

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  }

  lines.forEach((line, index) => {
    if (!line) {
      flushList();
      return;
    }

    const listMatch = line.match(/^[-•]\s+(.+)$/u);
    if (listMatch) {
      listItems.push(listMatch[1]);
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
