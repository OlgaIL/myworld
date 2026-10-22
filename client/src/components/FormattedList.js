import { createElement } from "react";
import { formatFormattedLine, getFormattedList } from "../utils/formattedText.js";

export function FormattedList({ block, renderText = (text) => text }) {
  const list = getFormattedList(block);
  return createElement(list.ordered ? "ol" : "ul",
    list.ordered && list.start !== 1 ? { start: list.start } : null,
    list.items.map((item, index) => createElement("li", { key: index },
      renderText(formatFormattedLine(item)),
      ...(index === list.items.length - 1 ? (block.nestedLists || []).map((child, childIndex) => (
        createElement(FormattedList, { key: childIndex, block: child, renderText })
      )) : [])
    )));
}
