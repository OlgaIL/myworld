import { useEffect, useState } from "react";
import { getGuestDocument, uploadGuestPhoto } from "../services/api";

export function useGuestDocument(enabled = true) {
  const [guestDocument, setGuestDocument] = useState(null);
  const [loading, setLoading] = useState(enabled);

  async function loadGuestDocument() {
    if (!enabled) {
      setGuestDocument(null);
      setLoading(false);
      return null;
    }

    try {
      setLoading(true);
      const document = await getGuestDocument();
      setGuestDocument(document || null);
      return document || null;
    } catch (error) {
      console.error("Ошибка загрузки guest document:", error);
      setGuestDocument(null);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function addGuestDocument(file) {
    const uploadedDocument = await uploadGuestPhoto(file);
    setGuestDocument(uploadedDocument || null);
    return uploadedDocument;
  }

  useEffect(() => {
    loadGuestDocument();
  }, [enabled]);

  return {
    guestDocument,
    guestLoading: loading,
    addGuestDocument,
    reloadGuestDocument: loadGuestDocument
  };
}
