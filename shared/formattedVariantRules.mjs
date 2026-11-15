export function canAssessFormattedDuplicate({ status, enrichmentPending, hasTable, tableStatus, tableContent }) {
  return status === "processed" && !enrichmentPending && !hasTable
    && (!tableStatus || tableStatus === "not_started") && !tableContent?.blocks?.length;
}

export function arePlainParagraphsIdentical(content, text) {
  const blocks = content?.blocks;
  if (typeof text !== "string" || !text.trim() || !Array.isArray(blocks) || !blocks.length) return false;
  if (blocks.some(block => !block || block.type !== "paragraph" || typeof block.text !== "string"
    || !block.text.trim() || Object.keys(block).some(key => !["type", "text"].includes(key)))) return false;
  // Literal text and paragraph boundaries are significant. Missing blocks are
  // unknown, never evidence that a protected variant duplicates public text.
  const paragraphs = text.split("\n\n");
  return paragraphs.length === blocks.length && blocks.every((block, index) => block.text === paragraphs[index]);
}

export function promoteDocumentTitle(content, title) {
  if (!Array.isArray(content?.blocks) || String(title || "").trim().length < 12) return content;
  const heading = String(title).trim();
  const index = content.blocks.findIndex((block) => {
    if (block.type !== "paragraph") return false;
    const text = String(block.text || "").trim();
    return text.toLocaleLowerCase("ru-RU").startsWith(heading.toLocaleLowerCase("ru-RU"))
      && (!text[heading.length] || /^[\s:—–.,]/u.test(text[heading.length]));
  });
  if (index < 0) return content;
  const blocks = [...content.blocks];
  const original = String(blocks[index].text || "").trim();
  const rest = original.slice(heading.length).replace(/^[\s:—–.]+/u, "").trim();
  blocks.splice(index, 1, { type: "heading", text: original.slice(0, heading.length) },
    ...(rest ? [{ type: "paragraph", text: rest }] : []));
  return { ...content, blocks };
}
