import { useState } from "react";
import { UPLOAD_STAGE_MESSAGES } from "../constants/uploadStages";
import { processPhoto } from "../services/api";
import { prepareImageForUpload } from "../utils/prepareImageForUpload";

export function useCabinetUpload({
  user,
  addPhoto,
  reloadPhotos,
  reloadUser,
  recordUploadAllowed
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState([]);

  function updatePendingPhoto(name, updates) {
    setPendingPhotos((current) => current.map((photo) => (
      photo.name === name ? { ...photo, ...updates } : photo
    )));
  }

  function removePendingPhoto(name) {
    setPendingPhotos((current) => current.filter((photo) => photo.name !== name));
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) {
      return;
    }

    if (!recordUploadAllowed) {
      alert("Лимит бесплатного пакета обработок достигнут. Для новых загрузок нужно расширить доступ.");
      event.target.value = "";
      return;
    }

    const queuedPhotos = files.map((file, index) => ({
      name: `pending-${Date.now()}-${index}-${file.name}`,
      url: URL.createObjectURL(file),
      sourceFile: file,
      isPendingUpload: true,
      uploadMessage: index === 0 ? UPLOAD_STAGE_MESSAGES.preparingImage : "Ожидает загрузки..."
    }));
    const queuedNames = new Set(queuedPhotos.map((photo) => photo.name));
    const revokedUrls = new Set();

    function revokePendingUrl(url) {
      if (!revokedUrls.has(url)) {
        URL.revokeObjectURL(url);
        revokedUrls.add(url);
      }
    }

    try {
      setUploading(true);
      setPendingPhotos((current) => [...queuedPhotos, ...current]);

      for (const pendingPhoto of queuedPhotos) {
        let preparingTimer = null;

        try {
          setUploadMessage(UPLOAD_STAGE_MESSAGES.preparingImage);
          updatePendingPhoto(pendingPhoto.name, {
            uploadMessage: UPLOAD_STAGE_MESSAGES.preparingImage
          });

          const uploadFile = await prepareImageForUpload(pendingPhoto.sourceFile);

          setUploadMessage(UPLOAD_STAGE_MESSAGES.uploading);
          updatePendingPhoto(pendingPhoto.name, {
            uploadMessage: UPLOAD_STAGE_MESSAGES.uploading
          });

          const uploadedPhoto = await addPhoto(uploadFile, { reload: false });

          if (user?.processingAllowed && uploadedPhoto?.filename) {
            setUploadMessage(UPLOAD_STAGE_MESSAGES.recognizing);
            updatePendingPhoto(pendingPhoto.name, {
              uploadMessage: UPLOAD_STAGE_MESSAGES.recognizing
            });

            preparingTimer = window.setTimeout(() => {
              setUploadMessage(UPLOAD_STAGE_MESSAGES.preparing);
              updatePendingPhoto(pendingPhoto.name, {
                uploadMessage: UPLOAD_STAGE_MESSAGES.preparing
              });
            }, 2500);

            await processPhoto(uploadedPhoto.filename);
            window.clearTimeout(preparingTimer);
            preparingTimer = null;
          }

          await Promise.all([reloadPhotos(), reloadUser()]);
        } catch (error) {
          console.error("Upload error:", error);

          if (error.message === "USER_RECORD_LIMIT_REACHED") {
            alert("Лимит бесплатного пакета обработок достигнут. Для новых загрузок нужно расширить доступ.");
          } else {
            alert("Не удалось загрузить запись");
          }

          break;
        } finally {
          if (preparingTimer) {
            window.clearTimeout(preparingTimer);
          }

          removePendingPhoto(pendingPhoto.name);
          revokePendingUrl(pendingPhoto.url);
        }
      }
    } finally {
      setPendingPhotos((current) => current.filter((photo) => !queuedNames.has(photo.name)));
      queuedPhotos.forEach((photo) => revokePendingUrl(photo.url));
      event.target.value = "";
      setUploadMessage("");
      setUploading(false);
    }
  }

  return {
    uploading,
    uploadMessage,
    pendingPhotos,
    handleUpload
  };
}
