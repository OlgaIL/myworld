export function capitalizeFormattedLine(value) {
  const text = String(value || "");

  return text.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
}
