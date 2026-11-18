export function getDocumentDisplayTitle(info, fallback = "Запись") {
  const awaitingTitle = ["uploaded", "processing"].includes(info?.status)
    && !info?.title?.trim();
  return awaitingTitle ? "Загружается новая запись…" : info?.displayTitle || info?.title || fallback;
}
