const DEFAULT_MAX_SIDE = 2000;
const DEFAULT_JPEG_QUALITY = 0.82;
const DEFAULT_SKIP_BELOW_BYTES = 1200000;
const clientEnv = import.meta.env || {};

function readNumberEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readQualityEnv(value, fallback) {
  const parsed = readNumberEnv(value, fallback);
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.min(normalized, 1);
}

const IMAGE_MAX_SIDE = readNumberEnv(clientEnv.VITE_IMAGE_MAX_SIDE, DEFAULT_MAX_SIDE);
const IMAGE_JPEG_QUALITY = readQualityEnv(clientEnv.VITE_IMAGE_JPEG_QUALITY, DEFAULT_JPEG_QUALITY);
const IMAGE_SKIP_BELOW_BYTES = readNumberEnv(
  clientEnv.VITE_IMAGE_SKIP_BELOW_BYTES,
  DEFAULT_SKIP_BELOW_BYTES
);

function canCompressImage(file) {
  return file && file.type?.startsWith("image/") && file.type !== "image/gif";
}

function getTargetSize(width, height) {
  const longestSide = Math.max(width, height);

  if (longestSide <= IMAGE_MAX_SIDE) {
    return { width, height, shouldResize: false };
  }

  const ratio = IMAGE_MAX_SIDE / longestSide;

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
    shouldResize: true
  };
}

function createPreparedFile(blob, sourceFile) {
  const originalName = sourceFile.name || "document";
  const preparedName = originalName.replace(/\.[^.]+$/, "") || "document";

  return new File([blob], `${preparedName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== "function" || typeof URL?.createObjectURL !== "function") {
      reject(new Error("Image element fallback is unavailable"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    function revokeObjectUrl() {
      URL.revokeObjectURL(objectUrl);
    }

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;

      if (!width || !height) {
        revokeObjectUrl();
        reject(new Error("Image element returned empty dimensions"));
        return;
      }

      resolve({
        drawable: image,
        width,
        height,
        close: revokeObjectUrl
      });
    };
    image.onerror = () => {
      revokeObjectUrl();
      reject(new Error("Image element could not decode the file"));
    };
    image.decoding = "async";
    image.src = objectUrl;
  });
}

function safeErrorDetails(error) {
  return {
    errorName: String(error?.name || "Error").slice(0, 80),
    errorMessage: String(error?.message || "").replace(/[\r\n\t]+/g, " ").slice(0, 160)
  };
}

export async function prepareImageForUpload(file, options = {}) {
  const {
    uploadAttemptId = "",
    onDiagnostic,
    createImageBitmapFn = globalThis.createImageBitmap,
    loadImageElementFn = loadImageElement,
    createCanvas = () => document.createElement("canvas")
  } = options;
  const startedAt = Date.now();
  const originalSizeBytes = Number(file?.size) || 0;
  const mimeType = String(file?.type || "");

  function log(event, details = {}) {
    onDiagnostic?.(event, {
      uploadAttemptId,
      sourceSizeBytes: originalSizeBytes,
      mimeType,
      durationMs: Date.now() - startedAt,
      ...details
    });
  }

  log("image_prepare_started", { originalUsed: false });

  if (!canCompressImage(file) || file.size <= IMAGE_SKIP_BELOW_BYTES) {
    log("image_prepare_skipped_small", {
      resultSizeBytes: originalSizeBytes,
      originalUsed: true
    });
    return file;
  }

  let imageSource = null;
  let preparationMethod = "image_bitmap";
  let primaryDecodeError = null;

  try {
    if (typeof createImageBitmapFn !== "function") {
      throw new Error("createImageBitmap is unavailable");
    }

    const bitmap = await createImageBitmapFn(file);
    imageSource = {
      drawable: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close?.()
    };
  } catch (error) {
    primaryDecodeError = error;
    preparationMethod = "image_element_fallback";

    try {
      imageSource = await loadImageElementFn(file);
    } catch (fallbackError) {
      log("image_prepare_failed_original_used", {
        resultSizeBytes: originalSizeBytes,
        originalUsed: true,
        preparationMethod,
        primaryErrorName: safeErrorDetails(primaryDecodeError).errorName,
        primaryErrorMessage: safeErrorDetails(primaryDecodeError).errorMessage,
        ...safeErrorDetails(fallbackError)
      });
      return file;
    }
  }

  let imageClosed = false;

  function closeImage() {
    if (!imageClosed) {
      imageSource?.close?.();
      imageClosed = true;
    }
  }

  try {
    const { width, height, shouldResize } = getTargetSize(imageSource.width, imageSource.height);
    const sourceWidth = imageSource.width;
    const sourceHeight = imageSource.height;

    if (!shouldResize && file.type === "image/jpeg") {
      closeImage();
      log("image_prepare_skipped_not_smaller", {
        sourceWidth,
        sourceHeight,
        resultWidth: width,
        resultHeight: height,
        resultSizeBytes: originalSizeBytes,
        originalUsed: true,
        preparationMethod
      });
      return file;
    }

    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      closeImage();
      log("image_prepare_failed_original_used", {
        sourceWidth,
        sourceHeight,
        resultSizeBytes: originalSizeBytes,
        originalUsed: true,
        preparationMethod,
        errorName: "CanvasContextUnavailable",
        errorMessage: "Canvas 2D context is unavailable"
      });
      return file;
    }

    context.drawImage(imageSource.drawable, 0, 0, width, height);
    closeImage();

    const blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_JPEG_QUALITY);

    if (!blob) {
      log("image_prepare_failed_original_used", {
        sourceWidth,
        sourceHeight,
        resultWidth: width,
        resultHeight: height,
        resultSizeBytes: 0,
        originalUsed: true,
        preparationMethod,
        errorName: "CanvasBlobUnavailable",
        errorMessage: "Canvas produced no blob"
      });
      return file;
    }

    if (blob.size >= file.size) {
      log("image_prepare_skipped_not_smaller", {
        sourceWidth,
        sourceHeight,
        resultWidth: width,
        resultHeight: height,
        resultSizeBytes: blob.size,
        originalUsed: true,
        preparationMethod
      });
      return file;
    }

    const preparedFile = createPreparedFile(blob, file);
    log("image_prepare_resized", {
      sourceWidth,
      sourceHeight,
      resultWidth: width,
      resultHeight: height,
      resultSizeBytes: preparedFile.size,
      originalUsed: false,
      preparationMethod
    });
    return preparedFile;
  } catch (error) {
    closeImage();
    log("image_prepare_failed_original_used", {
      resultSizeBytes: originalSizeBytes,
      originalUsed: true,
      preparationMethod,
      ...safeErrorDetails(error)
    });
    return file;
  }
}
