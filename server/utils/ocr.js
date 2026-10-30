export function normalizeOcrResult(ocrResult) {
  if (typeof ocrResult === "string") {
    return {
      text: ocrResult,
      error: null
    };
  }

  if (ocrResult && typeof ocrResult === "object") {
    return {
      text: typeof ocrResult.text === "string" ? ocrResult.text : "",
      error: ocrResult.error || null,
      ...(ocrResult.layout ? { layout: ocrResult.layout } : {}),
      ...(ocrResult.reused ? { reused: true } : {})
    };
  }

  return {
    text: "",
    error: null
  };
}
