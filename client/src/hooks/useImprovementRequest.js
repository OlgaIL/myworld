import { useCallback, useEffect, useState } from "react";
import { getLatestImprovementRequest } from "../constants/improvementRequestStatuses";
import {
  createImprovementRequest,
  getPhotoImprovementRequests
} from "../services/api";

export function useImprovementRequest(documentId, enabled, { onRequestChanged } = {}) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadRequest = useCallback(async () => {
    if (!enabled || !documentId) {
      setRequest(null);
      setLoading(false);
      setError("");
      return null;
    }

    try {
      setRequest(null);
      setLoading(true);
      setError("");
      const requests = await getPhotoImprovementRequests(documentId);
      const latest = getLatestImprovementRequest(requests);
      setRequest(latest);
      onRequestChanged?.(latest);
      return latest;
    } catch (loadError) {
      console.error("Improvement request load failed:", loadError);
      setError("Не удалось загрузить статус запроса.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [documentId, enabled, onRequestChanged]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const submitRequest = useCallback(async ({ comment }) => {
    if (!enabled || !documentId || submitting) {
      return null;
    }

    try {
      setSubmitting(true);
      setError("");
      const created = await createImprovementRequest(documentId, {
        comment,
        manualReviewConsent: true
      });
      setRequest(created);
      onRequestChanged?.(created);
      return created;
    } catch (submitError) {
      console.error("Improvement request create failed:", submitError);
      setError("Не удалось отправить запрос. Попробуйте ещё раз.");
      throw submitError;
    } finally {
      setSubmitting(false);
    }
  }, [documentId, enabled, onRequestChanged, submitting]);

  return {
    request,
    loading,
    submitting,
    error,
    submitRequest,
    reloadRequest: loadRequest
  };
}
