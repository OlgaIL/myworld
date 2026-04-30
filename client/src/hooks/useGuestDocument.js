import { useEffect, useState } from "react";
import { getGuestDocument, uploadGuestPhoto } from "../services/api";

const DEFAULT_GUEST_ACCESS = {
  documentsUsed: 0,
  documentsRemaining: 1,
  uploadAllowed: true
};

export function useGuestDocument(enabled = true) {
  const [guestDocument, setGuestDocument] = useState(null);
  const [guestAccess, setGuestAccess] = useState(DEFAULT_GUEST_ACCESS);
  const [loading, setLoading] = useState(enabled);

  async function loadGuestDocument() {
    if (!enabled) {
      setGuestDocument(null);
      setGuestAccess(DEFAULT_GUEST_ACCESS);
      setLoading(false);
      return null;
    }

    try {
      setLoading(true);
      const guestState = await getGuestDocument();
      setGuestDocument(guestState?.document || null);
      setGuestAccess(guestState?.access || DEFAULT_GUEST_ACCESS);
      return guestState || null;
    } catch (error) {
      console.error("Ошибка загрузки guest document:", error);
      setGuestDocument(null);
      setGuestAccess(DEFAULT_GUEST_ACCESS);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function addGuestDocument(file) {
    const guestState = await uploadGuestPhoto(file);
    setGuestDocument(guestState?.document || null);
    setGuestAccess(guestState?.access || DEFAULT_GUEST_ACCESS);
    return guestState;
  }

  useEffect(() => {
    loadGuestDocument();
  }, [enabled]);

  return {
    guestDocument,
    guestAccess,
    guestLoading: loading,
    addGuestDocument,
    reloadGuestDocument: loadGuestDocument
  };
}
