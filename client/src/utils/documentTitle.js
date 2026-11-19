export function getDocumentDisplayTitle(info, fallback = "Запись") {
  const awaitingTitle = ["uploaded", "processing"].includes(info?.status)
    && !info?.title?.trim();
  return awaitingTitle ? "Название загружается…" : info?.displayTitle || info?.title || fallback;
}
