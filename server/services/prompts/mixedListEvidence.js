// A narrow hint for a flat numbered list followed by bullets. Keep OCR text
// verbatim: this supplies boundaries to the model, never replacement prose.
export function mixedListEvidence(text) {
  if (String(text || "").length > 40000) return null;
  const groups = [];
  let current;
  let separated = false;
  for (const line of String(text || "").split(/\r?\n/u)) {
    if (!line.trim()) {
      if (current) separated = true;
      continue;
    }
    const numbered = line.match(/^(\d{1,3})(?:[.)]\s*|\s+)(\S.*)$/u);
    const bullet = line.match(/^[•●▪*-]\s+(\S.*)$/u);
    if (!numbered && !bullet) {
      if (current) {
        // Blank paragraphs or indented markers make the boundaries ambiguous.
        if (separated || /^\s+(?:\d+[.)]|[•●▪*-])\s+/u.test(line)) return null;
        current.items.at(-1).text += `\n${line}`;
      }
      continue;
    }
    const ordered = Boolean(numbered);
    if (!current || current.ordered !== ordered) {
      if (groups.length >= 2) return null;
      current = { ordered, items: [] };
      groups.push(current);
    }
    separated = false;
    current.items.push({ ...(ordered ? { number: Number(numbered[1]) } : {}), text: numbered ? numbered[2] : bullet[1] });
    if (current.items.length > 100) return null;
  }
  if (groups.length !== 2 || !groups[0].ordered || groups[1].ordered
    || groups[0].items.length < 2 || groups[1].items.length < 2) return null;
  if (groups[0].items.some((item, index, items) => index && item.number !== items[index - 1].number + 1)) return null;
  return groups;
}
