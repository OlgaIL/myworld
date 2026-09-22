export function normalizeRotation(rotation) {
  return ((Number(rotation) % 360) + 360) % 360;
}

export function getRotatedImageFit({
  naturalWidth,
  naturalHeight,
  frameWidth,
  frameHeight,
  rotation
}) {
  const width = Number(naturalWidth) || 0;
  const height = Number(naturalHeight) || 0;
  const availableWidth = Number(frameWidth) || 0;
  const availableHeight = Number(frameHeight) || 0;

  if (width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return { width: 0, height: 0, scale: 1 };
  }

  const sideways = normalizeRotation(rotation) % 180 === 90;
  const rotatedWidth = sideways ? height : width;
  const rotatedHeight = sideways ? width : height;
  const scale = Math.min(
    availableWidth / rotatedWidth,
    availableHeight / rotatedHeight,
    1
  );

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale
  };
}
