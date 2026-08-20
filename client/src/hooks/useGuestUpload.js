import { useRef, useState } from "react";
import { UPLOAD_STAGE_MESSAGES } from "../constants/uploadStages";
import { trackGoal } from "../services/analytics";
import { prepareImageForUpload } from "../utils/prepareImageForUpload";
import {
  createUploadAttemptId,
  logUploadDiagnostic,
  reportGuestUploadFailure
} from "../utils/uploadDiagnostics";

export function useGuestUpload({
  uploadAllowed,
  limitMessage,
  addGuestDocument,
  onUploadStart,
  fileInputRef
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [error, setError] = useState("");
  const [replacingDocumentId, setReplacingDocumentId] = useState(null);
  const replaceDocumentIdRef = useRef(null);

  function openUpload(replaceDocumentId = null) {
    replaceDocumentIdRef.current = replaceDocumentId;
    fileInputRef.current?.click();
  }

  async function handleUpload(event) {
    if (!uploadAllowed) {
      setError(limitMessage);
      event.target.value = "";
      replaceDocumentIdRef.current = null;
      setReplacingDocumentId(null);
      return;
    }

    const file = event.target.files[0];

    if (!file) {
      replaceDocumentIdRef.current = null;
      setReplacingDocumentId(null);
      return;
    }

    let recognizingTimer = null;
    let preparingTimer = null;
    const uploadMode = replaceDocumentIdRef.current ? "replace" : "new";
    const uploadAttemptId = createUploadAttemptId();
    const reportDiagnostic = (diagnosticEvent, details = {}) => {
      logUploadDiagnostic(diagnosticEvent, details);

      if (diagnosticEvent === "upload_failed") {
        reportGuestUploadFailure(details);
      }
    };

    try {
      setUploading(true);
      setReplacingDocumentId(replaceDocumentIdRef.current);
      setError("");
      trackGoal("guest_upload_start", {
        upload_mode: uploadMode,
        upload_attempt_id: uploadAttemptId
      });
      onUploadStart?.();
      setUploadMessage(UPLOAD_STAGE_MESSAGES.preparingImage);
      const uploadFile = await prepareImageForUpload(file, {
        uploadAttemptId,
        onDiagnostic: reportDiagnostic
      });
      setUploadMessage(UPLOAD_STAGE_MESSAGES.uploading);
      recognizingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.recognizing);
      }, 1200);
      preparingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.preparing);
      }, 4500);
      const guestState = await addGuestDocument(uploadFile, {
        replaceDocumentId: replaceDocumentIdRef.current,
        uploadAttemptId,
        onDiagnostic: reportDiagnostic
      });
      const processedDocument = guestState?.document;
      const readableText = processedDocument?.cleanText || processedDocument?.text || "";

      if (processedDocument?.status === "processed" && readableText.trim()) {
        trackGoal("guest_upload_success", {
          upload_mode: uploadMode,
          upload_attempt_id: uploadAttemptId
        });
      }
      window.clearTimeout(recognizingTimer);
      window.clearTimeout(preparingTimer);
      recognizingTimer = null;
      preparingTimer = null;
      setUploadMessage("");
    } catch (uploadError) {
      console.error("Guest upload error:", uploadError);

      if (uploadError.message === "GUEST_LIMIT_REACHED") {
        setError("Чтобы загрузить следующую запись, войдите в кабинет.");
      } else {
        setError(uploadError.message || "Не удалось загрузить запись.");
      }

      setUploadMessage("");
    } finally {
      if (recognizingTimer) {
        window.clearTimeout(recognizingTimer);
      }
      if (preparingTimer) {
        window.clearTimeout(preparingTimer);
      }
      event.target.value = "";
      replaceDocumentIdRef.current = null;
      setReplacingDocumentId(null);
      setUploading(false);
    }
  }

  return {
    uploading,
    uploadMessage,
    error,
    replacingDocumentId,
    openUpload,
    handleUpload
  };
}
