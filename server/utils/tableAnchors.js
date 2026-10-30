export function getTableSources(content) {
  return (content?.blocks || []).filter((block) => block.type === "table_source");
}

export function validateTableSources(content, { required = false } = {}) {
  const sources = getTableSources(content);
  if ((required && !sources.length) || sources.length > 10
    || sources.some((block, index) => block.tableId !== `table-${index + 1}`
      || typeof block.text !== "string" || !block.text.trim())) {
    throw new Error("INVALID_TABLE_ANCHORS");
  }
  return sources;
}
