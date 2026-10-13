import { useCallback, useState } from "react";
import { writeClipboardContent } from "../utils/formattedClipboard.js";

export function useCopyFeedback() {
  const [copiedMap, setCopiedMap] = useState({});

  const resetCopied = useCallback(function resetCopied() {
    setCopiedMap({});
  }, []);

  const copyText = useCallback(async function copyText(key, text, options) {
    if (!text) {
      return false;
    }

    try {
      await writeClipboardContent(text, options);
      setCopiedMap((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [key]: false }));
      }, 1500);
      return true;
    } catch (error) {
      console.error("Copy failed:", error);
      alert(options?.html
        ? "Не удалось скопировать таблицы с оформлением. Можно выделить текст и таблицы на странице и скопировать их вручную."
        : "Не удалось скопировать текст");
      return false;
    }
  }, []);

  return {
    copiedMap,
    copyText,
    resetCopied
  };
}
