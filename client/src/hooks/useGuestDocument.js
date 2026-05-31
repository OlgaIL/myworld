import { useEffect, useState } from "react";
import { getGuestDocument, uploadGuestPhoto } from "../services/api";

const DEFAULT_GUEST_ACCESS = {
  documentLimit: 5,
  documentsUsed: 0,
  documentsRemaining: 5,
  uploadAllowed: true
};

export function useGuestDocument(enabled = true) {
  const [guestDocument, setGuestDocument] = useState(null);
  const [guestDocuments, setGuestDocuments] = useState([]);
  const [guestAccess, setGuestAccess] = useState(DEFAULT_GUEST_ACCESS);
  const [loading, setLoading] = useState(enabled);

  async function loadGuestDocument() {
    if (!enabled) {
      setGuestDocument(null);
      setGuestDocuments([]);
      setGuestAccess(DEFAULT_GUEST_ACCESS);
      setLoading(false);
      return null;
    }

    try {
      setLoading(true);
      const guestState = await getGuestDocument();
      const documents = Array.isArray(guestState?.documents) ? guestState.documents : [];
      setGuestDocuments(documents);
      setGuestDocument(guestState?.document || documents[0] || null);
      setGuestAccess(guestState?.access || DEFAULT_GUEST_ACCESS);
      return guestState || null;
    } catch (error) {
      console.error("Ошибка загрузки guest document:", error);
      setGuestDocument(null);
      setGuestDocuments([]);
      setGuestAccess(DEFAULT_GUEST_ACCESS);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function addGuestDocument(file, options = {}) {
    const guestState = await uploadGuestPhoto(file, options);
    const documents = Array.isArray(guestState?.documents) ? guestState.documents : [];
    setGuestDocuments(documents);
    setGuestDocument(guestState?.document || documents[0] || null);
    setGuestAccess(guestState?.access || DEFAULT_GUEST_ACCESS);
    return guestState;
  }

  useEffect(() => {
    loadGuestDocument();
  }, [enabled]);

  return {
    guestDocument,
    guestDocuments,
    guestAccess,
    guestLoading: loading,
    addGuestDocument,
    reloadGuestDocument: loadGuestDocument
  };
}
