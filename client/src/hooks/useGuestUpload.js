import { useRef, useState } from "react";
import { UPLOAD_STAGE_MESSAGES } from "../constants/uploadStages";
import { prepareImageForUpload } from "../utils/prepareImageForUpload";

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

    try {
      setUploading(true);
      setReplacingDocumentId(replaceDocumentIdRef.current);
      setError("");
      onUploadStart?.();
      setUploadMessage(UPLOAD_STAGE_MESSAGES.preparingImage);
      const uploadFile = await prepareImageForUpload(file);
      setUploadMessage(UPLOAD_STAGE_MESSAGES.uploading);
      recognizingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.recognizing);
      }, 1200);
      preparingTimer = window.setTimeout(() => {
        setUploadMessage(UPLOAD_STAGE_MESSAGES.preparing);
      }, 4500);
      await addGuestDocument(uploadFile, {
        replaceDocumentId: replaceDocumentIdRef.current
      });
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
