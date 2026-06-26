import { useMemo } from "react";
import { getGuestDocumentFileUrl } from "../services/api";

export function useGuestDocumentPageData(document) {
  return useMemo(() => {
    if (!document) {
      return {
        photo: null,
        info: null
      };
    }

    const fileUrl = getGuestDocumentFileUrl(document.id, document.updatedAt || document.filename);

    return {
      photo: {
        name: fileUrl,
        url: fileUrl
      },
      info: {
        status: document.status,
        title: document.title || "Запись",
        summary: document.summary || "",
        category: document.category || "",
        section: document.section || "",
        topic: document.topic || "",
        tags: Array.isArray(document.tags) ? document.tags : [],
        text: document.text || "",
        cleanText: document.cleanText || "",
        textQuality: document.textQuality || "",
        notes: document.notes || "",
        error: document.error || null,
        createdAt: document.createdAt || null
      }
    };
  }, [document]);
}
