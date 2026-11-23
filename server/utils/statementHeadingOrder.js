// Conservative block reordering, enabled explicitly by the service guard.
// Only reorder existing blocks; never rewrite fields or globally sort a page.
const tokens = value => String(value ?? '').toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) || [];
const key = value => tokens(value).join(' ');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const headingPattern = /^(?:заявление|исковое заявление|административное исковое заявление|жалоба|апелляционная жалоба|кассационная жалоба|частная жалоба|ходатайство|возражение|возражения)$/u;

function labels(text) {
  const normalized = key(text);
  return new Set([
    /(?:^| )(?:суд|судье|суду|руководителю|директору|начальнику|адресат)(?: |$)/u.test(normalized) && 'recipient',
    /(?:^| )(?:заявитель|заявителя|истец|истца|ответчик|ответчика)(?: |$)/u.test(normalized) && 'party',
    /(?:^| )(?:адрес|телефон|факс|почты)(?: |$)/u.test(normalized) && 'contact'
  ].filter(Boolean));
}

function geometry(layout) {
  const annotations = layout.textAnnotations.slice(1);
  if (annotations.some(a => !a || typeof a.description !== 'string')) return null;
  const words = annotations.map((annotation, index) => {
    const vertices = annotation?.boundingPoly?.vertices;
    if (!Array.isArray(vertices) || vertices.length !== 4 || vertices.some(p => !p || typeof p !== 'object')
      || !tokens(annotation.description).length) return null;
    const xs = vertices.map(p => Number(p.x ?? 0)), ys = vertices.map(p => Number(p.y ?? 0));
    if (![...xs, ...ys].every(Number.isFinite)) return null;
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    if (left < 0 || top < 0 || right > layout.width + 1 || bottom > layout.height + 1 || right <= left || bottom <= top) return null;
    const dx = xs[1] - xs[0], dy = ys[1] - ys[0];
    if (dx <= 0 || Math.abs(dy / dx) > 0.25) return null;
    return { id: index + 1, text: annotation.description, left, right, x: (left + right) / 2,
      y: ys.reduce((sum, y) => sum + y, 0) / 4, height: bottom - top, slope: dy / dx };
  });
  // Punctuation-only annotations do not supply heading/header word evidence.
  if (words.some((word, index) => !word && tokens(annotations[index]?.description).length)) return null;
  const valid = words.filter(Boolean);
  if (valid.length < 8) return null;
  const skew = median(valid.map(w => w.slope)), height = median(valid.map(w => w.height));
  for (const word of valid) word.rowY = word.y - skew * word.x;
  const lines = [];
  for (const word of [...valid].sort((a, b) => a.rowY - b.rowY || a.left - b.left)) {
    let line = lines.at(-1);
    if (!line || Math.abs(word.rowY - line.y) > height * 0.55) {
      line = { words: [], y: word.rowY }; lines.push(line);
    }
    line.words.push(word);
    line.y = median(line.words.map(w => w.rowY));
  }
  for (const line of lines) {
    line.words.sort((a, b) => a.left - b.left);
    line.text = line.words.map(w => w.text).join(' ');
    line.key = key(line.text);
    line.left = Math.min(...line.words.map(w => w.left));
    line.right = Math.max(...line.words.map(w => w.right));
  }
  return { words: valid, lines, height };
}

function correctedHeading(lineKey, corrections) {
  if (headingPattern.test(lineKey)) return lineKey;
  const matches = corrections.filter(c => c && typeof c === 'object' && c.applied !== false && key(c.original) === lineKey
    && headingPattern.test(key(c.replacement)));
  return matches.length === 1 ? key(matches[0].replacement) : null;
}

function bagOf(words) {
  const bag = new Map();
  for (const token of words) bag.set(token, (bag.get(token) || 0) + 1);
  return bag;
}
function take(bag, words) {
  const needed = bagOf(words);
  if ([...needed].some(([word, count]) => count > (bag.get(word) || 0))) return false;
  for (const [word, count] of needed) bag.set(word, bag.get(word) - count);
  return true;
}

export function proposeStatementHeadingOrder({ content, layout, sourceText, sourceVerified = false, corrections = [] } = {}) {
  const stop = (status, reason) => ({ status, reason, content });
  if (!sourceVerified || layout?.version !== 1 || layout.provider !== 'google'
    || !/^[a-f0-9]{64}$/u.test(String(layout.sourceSha256 || ''))
    || !Number.isFinite(layout.width) || !Number.isFinite(layout.height) || layout.width <= 0 || layout.height <= 0
    || !String(sourceText || '').trim() || String(layout.text || '').trim() !== String(sourceText || '').trim()
    || !Array.isArray(layout.textAnnotations) || layout.textAnnotations.length > 5000
    || !Array.isArray(content?.blocks) || content.blocks.length > 100
    || content.blocks.some(block => !block || typeof block !== 'object')) return stop('not_applicable', 'unverified_source');
  const appliedCorrections = Array.isArray(corrections) ? corrections : [];
  const page = geometry(layout);
  if (!page) return stop('not_applicable', 'unsupported_geometry');

  const candidates = [];
  for (let start = 0; start < page.lines.length; start++) {
    for (const count of [1, 2]) {
      const lines = page.lines.slice(start, start + count);
      if (lines.length !== count || count === 2 && lines[1].y - lines[0].y > page.height * 2) continue;
      const title = correctedHeading(lines.map(line => line.key).join(' '), appliedCorrections);
      if (!title) continue;
      const center = (Math.min(...lines.map(l => l.left)) + Math.max(...lines.map(l => l.right))) / 2;
      if (center < layout.width * 0.25 || center > layout.width * 0.75) continue;
      candidates.push({ start, end: start + count, title, top: lines[0].y, bottom: lines.at(-1).y });
    }
  }
  const maximal = candidates.filter(c => !candidates.some(other => other !== c
    && other.start <= c.start && other.end >= c.end && other.end - other.start > c.end - c.start));
  if (maximal.length !== 1) return stop(maximal.length ? 'ambiguous' : 'not_applicable', 'heading_not_unique');
  const heading = maximal[0];
  const headingIndices = content.blocks.flatMap((block, index) =>
    ['heading', 'paragraph'].includes(block.type) && key(block.text) === heading.title ? [index] : []);
  if (headingIndices.length !== 1) return stop('ambiguous', 'formatted_heading_not_unique');
  const titleIndex = headingIndices[0];
  const upper = page.words.filter(word => word.rowY < heading.top - page.height * 0.7);
  const upperTokens = upper.flatMap(w => tokens(w.text));
  const sourceLabels = labels(upper.map(w => w.text).join(' '));
  if (sourceLabels.size < 3) return stop('not_applicable', 'no_statement_header');

  // Only a subtitle exactly matching the first geometric lines below the
  // heading can travel with it. No fuzzy spelling or sentence guessing.
  let subtitleIndex = -1;
  const next = content.blocks[titleIndex + 1];
  if (next && ['heading', 'paragraph'].includes(next.type)
    && /^(?:о|об|на|по) /u.test(key(next.text)) && key(next.text).length <= 400 && !/[.!?]/u.test(next.text)) {
    const lines = page.lines.slice(heading.end, heading.end + 5);
    const subtitle = [];
    let previousY = heading.bottom;
    for (const line of lines) {
      if (line.y - previousY > page.height * 4) break;
      subtitle.push(line.key); previousY = line.y;
      if (subtitle.join(' ') === key(next.text)) { subtitleIndex = titleIndex + 1; break; }
    }
  }

  const available = bagOf(upperTokens), headerIndices = [];
  let end = 0;
  for (; end < content.blocks.length; end++) {
    if (end === titleIndex || end === subtitleIndex) continue;
    const block = content.blocks[end], words = tokens(block.text);
    if (block.type !== 'paragraph' || !words.length || !take(available, words)) break;
    headerIndices.push(end);
  }
  if (!headerIndices.length || titleIndex >= end) return stop('ambiguous', 'header_not_a_separate_prefix');
  const headerText = headerIndices.map(i => content.blocks[i].text).join(' ');
  const usedCount = upperTokens.length - [...available.values()].reduce((sum, n) => sum + n, 0);
  if (labels(headerText).size < 3 || usedCount / upperTokens.length < 0.9) return stop('ambiguous', 'header_incomplete_or_mixed');
  const lastHeader = headerIndices.at(-1);
  if (lastHeader < titleIndex) return stop('unchanged', 'already_in_order');
  const moving = [titleIndex, ...(subtitleIndex >= 0 && subtitleIndex < lastHeader ? [subtitleIndex] : [])];
  const prefix = content.blocks.slice(0, lastHeader + 1).filter((_, index) => !moving.includes(index));
  const blocks = [...prefix, ...moving.map(index => content.blocks[index]), ...content.blocks.slice(lastHeader + 1)];
  return { status: 'changed', reason: 'header_before_heading', content: { ...content, blocks },
    evidence: { headingWordIds: page.lines.slice(heading.start, heading.end).flatMap(l => l.words.map(w => w.id)),
      headingY: heading.top, headerCoverage: usedCount / upperTokens.length, movedBlockIndices: moving, headerBlockIndices: headerIndices } };
}
