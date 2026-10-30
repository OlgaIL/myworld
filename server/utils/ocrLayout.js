import { createHash } from "node:crypto";

export function imageSha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// Preserve provider coordinates without repairing, rotating or reflowing words.
export function buildGoogleOcrLayout(result, image, text) {
  if (result?.error) return null;
  const annotations = result?.textAnnotations;
  if (!Array.isArray(annotations) || annotations.length > 50000) return null;
  const textAnnotations = annotations.map((item) => ({
    description: String(item.description || ""),
    boundingPoly: { vertices: (item.boundingPoly?.vertices || []).slice(0, 4).map((point) => ({
      x: Number(point.x || 0), y: Number(point.y || 0)
    })) }
  }));
  const page = result.fullTextAnnotation?.pages?.[0];
  return {
    version: 1, provider: "google", method: "textDetection", sourceSha256: imageSha256(image),
    width: Number(page?.width) || null, height: Number(page?.height) || null,
    orientation: "as-recognized", coordinateSpace: "google-source-image",
    rawText: String(annotations[0]?.description || ""), text: String(text || ""), textAnnotations
  };
}

export function matchesOcrLayout(layout, image) {
  return layout?.version === 1 && layout.provider === "google"
    && layout.sourceSha256 === imageSha256(image)
    && Array.isArray(layout.textAnnotations) && layout.textAnnotations.length <= 50000
    && typeof layout.rawText === "string" && typeof layout.text === "string";
}
