export function isRedundantFormattedVariant({
  content, text, isAuthenticated, status, enrichmentPending, hasTable, tableStatus, tableContent
}) {
  if (!isAuthenticated || status !== "processed" || enrichmentPending || hasTable
    || (tableStatus && tableStatus !== "not_started") || tableContent?.blocks?.length) return false;

  const blocks = content?.blocks;
  if (typeof text !== "string" || !text.trim() || !Array.isArray(blocks) || !blocks.length) return false;
  if (blocks.some(block => !block || block.type !== "paragraph" || typeof block.text !== "string"
    || !block.text.trim() || Object.keys(block).some(key => !["type", "text"].includes(key)))) return false;

  // Compare exact paragraph boundaries and literal text; never flatten whitespace or infer structure.
  const paragraphs = text.split("\n\n");
  return paragraphs.length === blocks.length && blocks.every((block, index) => block.text === paragraphs[index]);
}
