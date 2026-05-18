const DEFAULT_MAX_SIDE = 2000;
const DEFAULT_JPEG_QUALITY = 0.82;
const DEFAULT_SKIP_BELOW_BYTES = 1200000;

function readNumberEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readQualityEnv(value, fallback) {
  const parsed = readNumberEnv(value, fallback);
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.min(normalized, 1);
}

const IMAGE_MAX_SIDE = readNumberEnv(import.meta.env.VITE_IMAGE_MAX_SIDE, DEFAULT_MAX_SIDE);
const IMAGE_JPEG_QUALITY = readQualityEnv(import.meta.env.VITE_IMAGE_JPEG_QUALITY, DEFAULT_JPEG_QUALITY);
const IMAGE_SKIP_BELOW_BYTES = readNumberEnv(
  import.meta.env.VITE_IMAGE_SKIP_BELOW_BYTES,
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

export async function prepareImageForUpload(file) {
  if (!canCompressImage(file) || file.size <= IMAGE_SKIP_BELOW_BYTES) {
    return file;
  }

  try {
    const image = await createImageBitmap(file);
    const { width, height, shouldResize } = getTargetSize(image.width, image.height);

    if (!shouldResize && file.type === "image/jpeg") {
      image.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      image.close?.();
      return file;
    }

    context.drawImage(image, 0, 0, width, height);
    image.close?.();

    const blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_JPEG_QUALITY);

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return createPreparedFile(blob, file);
  } catch (error) {
    console.warn("Image preparation skipped:", error);
    return file;
  }
}
