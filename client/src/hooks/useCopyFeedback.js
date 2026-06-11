import { useCallback, useState } from "react";

export function useCopyFeedback() {
  const [copiedMap, setCopiedMap] = useState({});

  const resetCopied = useCallback(function resetCopied() {
    setCopiedMap({});
  }, []);

  const copyText = useCallback(async function copyText(key, text) {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedMap((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [key]: false }));
      }, 1500);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Не удалось скопировать текст");
    }
  }, []);

  return {
    copiedMap,
    copyText,
    resetCopied
  };
}
