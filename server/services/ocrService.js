import fs from "fs";
import axios from "axios";

import vision from '@google-cloud/vision';
import { hasDetachedLeadingNumbers, repairDetachedLeadingNumbers } from "../utils/googleOcrLayout.js";

let googleClient;

// -------------------------
// Exported recognize
// -------------------------

export default {
  async recognize(imagePath, options = {} ) {
    const { provider } = options;

    if (provider === "google") {
      return recognizeGoogle(imagePath, options);
    }

    if (provider === "yandex") {
      return recognizeYandex(imagePath, options);
    }

    throw new Error("Unknown OCR provider");
  }
};

// --- GOOGLE OCR (твой текущий код, НЕ ломаем) ---
async function recognizeGoogle(imagePath, { captureLayout = false } = {}) {
  try {
    const image = captureLayout ? await fs.promises.readFile(imagePath) : null;
    googleClient ||= new vision.ImageAnnotatorClient();
    const [result] = await googleClient.textDetection(image ? { image: { content: image } } : imagePath,
      { timeout:30000, retry:null });
    if (result.error) {
      console.error("Google OCR response error:", {
        code: result.error.code,
        message: result.error.message
      });
    }
    const extracted = extractGoogleOcrResult(result);
    if (!captureLayout || result.error) return extracted;
    const { buildGoogleOcrLayout } = await import("../utils/ocrLayout.js");
    return { text: typeof extracted === "string" ? extracted : extracted.text,
      layout: buildGoogleOcrLayout(result, image, typeof extracted === "string" ? extracted : extracted.text) };

  } catch (error) {
    console.error("OCR error (Google):", error);
    throw error;
  }
}

export function extractGoogleOcrResult(result) {
  if (result?.error) {
    return {
      text: "",
      error: Number(result.error.code) === 8
        ? "Достигнут лимит Google OCR. Попробуйте позже."
        : "Сервис распознавания временно недоступен. Попробуйте позже."
    };
  }

  const detections = result?.textAnnotations;
  if (!detections?.length) return "";

  const detectedText = detections[0].description || "";
  return hasDetachedLeadingNumbers(detectedText)
    ? repairDetachedLeadingNumbers(detectedText, detections)
    : detectedText;
}

// --- YANDEX OCR  ------
async function recognizeYandex(imagePath, { apiKey, folderId, languageCodes = ["*"], model = "" }) {
  if (!apiKey) {
    throw new Error("YANDEX_API_KEY is not set");
  }

  if (!folderId) {
    throw new Error("YANDEX_FOLDER_ID is not set");
  }

  const fileContent = fs.readFileSync(imagePath);
  const base64 = fileContent.toString("base64");

  const textDetectionConfig = {
    languageCodes: Array.isArray(languageCodes) && languageCodes.length > 0 ? languageCodes : ["*"]
  };

  if (model) {
    textDetectionConfig.model = model;
  }

  const body = {
    folderId,
    analyzeSpecs: [
      {
        content: base64,
        features: [
          {
            type: "TEXT_DETECTION",
            textDetectionConfig
          }
        ]
      }
    ]
  };

  try {
    const response = await axios.post(
      "https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze",
      body,
      {
        headers: {
          Authorization: `Api-Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    const text = extractTextFromVision(response.data);

    return {
      text
    };

  } catch (error) {
    console.error("YANDEX VISION ERROR:", error.response?.data || error.message);

    return {
      text: null,
      error: "Yandex Vision failed"
    };
  }
}

function extractTextFromVision(data) {
  try {
    const pages =
      data?.results?.[0]?.results?.[0]?.textDetection?.pages || [];

    let text = "";

    for (const page of pages) {
      for (const block of page.blocks || []) {
        for (const line of block.lines || []) {
          for (const word of line.words || []) {
            if (word.text) {
              text += word.text + " ";
            }
          }
        }
      }
    }

    return text.trim() || null;

  } catch (e) {
    console.error("VISION PARSE ERROR:", e.message);
    return null;
  }
}

