const HEADER_HINTS = [
  /наименован/u, /показател/u, /вид\s+услуг/u, /ед\.?\s*изм/u,
  /единиц/u, /норматив/u, /потреблен/u, /тариф/u, /начислен/u,
  /количеств/u, /сумм/u, /цен[аыу]/u, /об[ъь]?[её]м/u,
  /итого/u, /всего/u
];

// Google OCR often puts every cell on its own line. Several distinct column
// headings followed by a dense run of numeric cells are a table signal even
// when the printed page has no numbered "Таблица" caption.
function hasUncaptionedTable(text) {
  const lines = String(text || "").toLocaleLowerCase("ru-RU").split(/\r?\n/u)
    .map((line) => line.trim()).filter(Boolean).slice(0, 400);
  for (let start = 0; start < lines.length; start++) {
    const window = lines.slice(start, start + 45);
    const headings = new Set();
    for (const line of window.slice(0, 15)) {
      if (line.length > 70) continue;
      HEADER_HINTS.forEach((hint, index) => { if (hint.test(line)) headings.add(index); });
    }
    if (headings.size < 3) continue;
    const numericCells = window.filter((line) => line.length <= 30
      && /^[\d\s.,%₽–—-]+$/u.test(line) && /\d/u.test(line)).length;
    const rowLabels = window.filter((line) => line.length <= 45 && /\p{L}/u.test(line)
      && !/\d/u.test(line)).length;
    if (numericCells >= 6 && rowLabels >= 3) return true;
  }
  return false;
}

// These signals unlock a reviewable extraction attempt, not an invented table.
export function isTableSuspected(photo) {
  return Boolean(photo?.has_table || photo?.table_status === "ready"
    || /(?:^|\n)\s*таблица\s*\d{1,3}\s*[—–-]\s*\S/imu.test(String(photo?.ocr_text || ""))
    || hasUncaptionedTable(photo?.ocr_text));
}
