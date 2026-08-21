import { useCallback, useEffect, useMemo, useState } from "react";
import { getImprovementRequests } from "../services/api";

export function useImprovementRequests(enabled) {
  const [requests, setRequests] = useState([]);

  const loadRequests = useCallback(async () => {
    if (!enabled) {
      setRequests([]);
      return [];
    }

    try {
      const loaded = await getImprovementRequests();
      const normalized = Array.isArray(loaded) ? loaded : [];
      setRequests(normalized);
      return normalized;
    } catch (error) {
      console.error("Improvement requests load failed:", error);
      return [];
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    getImprovementRequests()
      .then((loaded) => {
        if (!cancelled) {
          setRequests(Array.isArray(loaded) ? loaded : []);
        }
      })
      .catch((error) => {
        console.error("Improvement requests load failed:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const upsertRequest = useCallback((request) => {
    if (!request?.id) {
      return;
    }

    setRequests((current) => [
      request,
      ...current.filter((item) => item.id !== request.id)
    ]);
  }, []);

  const requestsByDocumentId = useMemo(() => {
    const result = {};

    for (const request of requests) {
      if (request?.documentId && !result[request.documentId]) {
        result[request.documentId] = request;
      }
    }

    return result;
  }, [requests]);

  return {
    requestsByDocumentId,
    reloadRequests: loadRequests,
    upsertRequest
  };
}
