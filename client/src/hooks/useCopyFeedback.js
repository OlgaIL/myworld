import { useCallback, useEffect, useRef, useState } from "react";
import { writeClipboardContent } from "../utils/formattedClipboard.js";

export function useCopyFeedback({ durationMs = 1500 } = {}) {
  const [copiedMap, setCopiedMap] = useState({});
  const timersRef = useRef(new Map());
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(timer => clearTimeout(timer)); timers.clear(); };
  }, []);

  const resetCopied = useCallback(function resetCopied() {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    setCopiedMap({});
  }, []);

  const copyText = useCallback(async function copyText(key, text, options) {
    if (!text) {
      return false;
    }

    try {
      await writeClipboardContent(text, options);
      clearTimeout(timersRef.current.get(key));
      setCopiedMap((prev) => ({ ...prev, [key]: true }));
      timersRef.current.set(key, setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [key]: false }));
        timersRef.current.delete(key);
      }, durationMs));
      return true;
    } catch (error) {
      console.error("Copy failed:", error);
      alert(options?.html
        ? "Не удалось скопировать таблицы с оформлением. Можно выделить текст и таблицы на странице и скопировать их вручную."
        : "Не удалось скопировать текст");
      return false;
    }
  }, [durationMs]);

  return {
    copiedMap,
    copyText,
    resetCopied
  };
}
