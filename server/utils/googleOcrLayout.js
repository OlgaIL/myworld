function getAnnotationBox(annotation) {
  const vertices = annotation?.boundingPoly?.vertices;
  if (!Array.isArray(vertices) || vertices.length === 0) {
    return null;
  }

  const xs = vertices.map((vertex) => Number(vertex?.x || 0));
  const ys = vertices.map((vertex) => Number(vertex?.y || 0));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  const height = bottom - top;

  if (!Number.isFinite(left) || !Number.isFinite(top) || height <= 0) {
    return null;
  }

  return {
    text: String(annotation?.description || "").trim(),
    left,
    top,
    bottom,
    height,
    centerY: top + height / 2
  };
}

function joinLineWords(words) {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.;:!?%])/gu, "$1")
    .trim();
}

export function hasDetachedLeadingNumbers(text) {
  return /^(?:\s*\d{1,3}[.)]?\s*\r?\n){2,}/u.test(String(text || ""));
}

export function reconstructGoogleOcrLines(annotations) {
  const words = (Array.isArray(annotations) ? annotations.slice(1) : [])
    .map(getAnnotationBox)
    .filter((word) => word?.text)
    .sort((left, right) => left.centerY - right.centerY || left.left - right.left);
  const lines = [];

  for (const word of words) {
    let bestLine = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const line of lines) {
      const distance = Math.abs(word.centerY - line.centerY);
      const tolerance = Math.max(word.height, line.averageHeight) * 0.48;
      if (distance <= tolerance && distance < bestDistance) {
        bestLine = line;
        bestDistance = distance;
      }
    }

    if (!bestLine) {
      lines.push({
        words: [word],
        centerY: word.centerY,
        averageHeight: word.height
      });
      continue;
    }

    bestLine.words.push(word);
    bestLine.centerY = bestLine.words.reduce((sum, item) => sum + item.centerY, 0) / bestLine.words.length;
    bestLine.averageHeight = bestLine.words.reduce((sum, item) => sum + item.height, 0) / bestLine.words.length;
  }

  return lines
    .sort((left, right) => left.centerY - right.centerY)
    .map((line) => joinLineWords(line.words.sort((left, right) => left.left - right.left)))
    .filter(Boolean)
    .join("\n");
}

export function repairDetachedLeadingNumbers(text, annotations) {
  const sourceLines = String(text || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const detachedNumbers = [];

  while (sourceLines.length > 0 && /^\d{1,3}[.)]?$/u.test(sourceLines[0])) {
    detachedNumbers.push(sourceLines.shift().replace(/[.)]$/u, ""));
  }

  if (detachedNumbers.length < 2) {
    return String(text || "");
  }

  const layoutLines = reconstructGoogleOcrLines(annotations).split("\n");
  const unmatchedNumbers = [];

  for (const number of detachedNumbers) {
    const layoutLine = layoutLines.find((line) => line.match(new RegExp(`^${number}[.)]?\\s+(.+)$`, "u")));
    const itemText = layoutLine?.match(/^\d{1,3}[.)]?\s+(.+)$/u)?.[1]?.trim();
    const sourceIndex = itemText
      ? sourceLines.findIndex((line) => line === itemText)
      : -1;

    if (sourceIndex === -1) {
      unmatchedNumbers.push(number);
      continue;
    }

    sourceLines[sourceIndex] = `${number} ${sourceLines[sourceIndex]}`;
  }

  return [...unmatchedNumbers, ...sourceLines].join("\n");
}
