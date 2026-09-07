export const GENERIC_RECOGNITION_NOTE = "В исходном тексте присутствуют ошибки распознавания и опечатки.";

const MAX_CORRECTIONS = 50;
const MAX_CORRECTION_TEXT_LENGTH = 200;

function normalizeCorrectionText(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, MAX_CORRECTION_TEXT_LENGTH)
    : "";
}

function getTextTargets(content) {
  if (!Array.isArray(content?.blocks)) {
    return [];
  }

  return content.blocks.flatMap((block, blockIndex) => {
    if (block?.type === "list" && Array.isArray(block.items)) {
      return block.items.flatMap((item, itemIndex) => (
        typeof item === "string"
          ? [{ blockIndex, itemIndex, text: item }]
          : []
      ));
    }

    return typeof block?.text === "string"
      ? [{ blockIndex, itemIndex: null, text: block.text }]
      : [];
  });
}

function targetKey({ blockIndex, itemIndex }) {
  return `${blockIndex}:${itemIndex === null ? "text" : itemIndex}`;
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function findReplacementLocations(targets, replacement) {
  return targets.flatMap((target) => {
    const locations = [];
    let start = target.text.indexOf(replacement);

    while (start !== -1) {
      locations.push({
        ...target,
        start,
        end: start + replacement.length
      });
      start = target.text.indexOf(replacement, start + 1);
    }

    return locations;
  });
}

export function normalizeTextCorrections(value, formattedContent, sourceText = "") {
  if (!Array.isArray(value)) {
    return [];
  }

  const targets = getTextTargets(formattedContent);
  const normalizedSourceText = String(sourceText || "").replace(/\s+/g, " ");
  const usedRanges = new Map();
  const corrections = [];

  for (const candidate of value) {
    if (corrections.length >= MAX_CORRECTIONS) {
      break;
    }

    const original = normalizeCorrectionText(candidate?.original);
    const replacement = normalizeCorrectionText(candidate?.replacement);

    if (
      !original || !replacement || original === replacement
      || (normalizedSourceText && !normalizedSourceText.includes(original))
    ) {
      continue;
    }

    const locations = findReplacementLocations(targets, replacement);

    // Without source coordinates, repeated replacement text cannot be mapped
    // reliably. Hiding that correction is safer than reverting the wrong word.
    if (locations.length !== 1) {
      continue;
    }

    const location = locations[0];
    const key = targetKey(location);
    const ranges = usedRanges.get(key) || [];
    const overlaps = ranges.some((range) => (
      rangesOverlap(location.start, location.end, range.start, range.end)
    ));

    if (overlaps) {
      continue;
    }

    ranges.push({ start: location.start, end: location.end });
    usedRanges.set(key, ranges);

    corrections.push({
      id: `correction-${corrections.length + 1}`,
      original,
      replacement,
      blockIndex: location.blockIndex,
      itemIndex: location.itemIndex,
      start: location.start,
      end: location.end,
      applied: true
    });
  }

  return corrections;
}

export function getStoredTextCorrections(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set();

  return value.flatMap((candidate) => {
    const id = typeof candidate?.id === "string" ? candidate.id.trim().slice(0, 80) : "";
    const original = normalizeCorrectionText(candidate?.original);
    const replacement = normalizeCorrectionText(candidate?.replacement);
    const blockIndex = Number(candidate?.blockIndex);
    const itemIndex = candidate?.itemIndex === null ? null : Number(candidate?.itemIndex);
    const start = Number(candidate?.start);
    const end = Number(candidate?.end);

    if (
      !id || seenIds.has(id) || !original || !replacement || original === replacement
      || !Number.isInteger(blockIndex) || blockIndex < 0
      || (itemIndex !== null && (!Number.isInteger(itemIndex) || itemIndex < 0))
      || !Number.isInteger(start) || start < 0
      || !Number.isInteger(end) || end <= start
    ) {
      return [];
    }

    seenIds.add(id);
    return [{
      id,
      original,
      replacement,
      blockIndex,
      itemIndex,
      start,
      end,
      applied: candidate.applied !== false
    }];
  }).slice(0, MAX_CORRECTIONS);
}

export function applyTextCorrections(formattedContent, value) {
  if (!Array.isArray(formattedContent?.blocks)) {
    return formattedContent;
  }

  const content = {
    ...formattedContent,
    blocks: formattedContent.blocks.map((block) => ({
      ...block,
      ...(Array.isArray(block?.items) ? { items: [...block.items] } : {})
    }))
  };

  const inactiveCorrections = getStoredTextCorrections(value)
    .filter((correction) => !correction.applied)
    .sort((left, right) => (
      right.blockIndex - left.blockIndex
      || (right.itemIndex ?? -1) - (left.itemIndex ?? -1)
      || right.start - left.start
    ));

  for (const correction of inactiveCorrections) {
    const block = content.blocks[correction.blockIndex];

    if (!block) {
      continue;
    }

    const currentText = correction.itemIndex === null
      ? block.text
      : block.items?.[correction.itemIndex];

    if (typeof currentText !== "string") {
      continue;
    }

    if (currentText.slice(correction.start, correction.end) !== correction.replacement) {
      continue;
    }

    const nextText = `${currentText.slice(0, correction.start)}${correction.original}${currentText.slice(correction.end)}`;

    if (correction.itemIndex === null) {
      block.text = nextText;
    } else {
      block.items[correction.itemIndex] = nextText;
    }
  }

  return content;
}

export function formattedContentToText(content) {
  return (content?.blocks || []).map((block) => {
    if (block.type === "list" && Array.isArray(block.items)) {
      return block.items.map((item) => `- ${item}`).join("\n");
    }

    return block.text || "";
  }).filter(Boolean).join("\n\n");
}

export function getEffectiveTextContent(formattedContent, corrections) {
  const effectiveContent = applyTextCorrections(formattedContent, corrections);
  return {
    formattedContent: effectiveContent,
    cleanText: formattedContentToText(effectiveContent)
  };
}

export function toPublicTextCorrections(value) {
  return getStoredTextCorrections(value).map(({ id, original, replacement, applied }) => ({
    id,
    original,
    replacement,
    applied
  }));
}
