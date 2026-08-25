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
