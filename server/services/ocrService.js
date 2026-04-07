import fs from "fs";
import axios from "axios";

import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient();

// -------------------------
// Exported recognize
// -------------------------

export default {
  async recognize(imagePath, options = {} ) {
    const { provider } = options;

    if (provider === "google") {
      return recognizeGoogle(imagePath);
    }

    if (provider === "yandex") {
      return recognizeYandex(imagePath, options);
    }

    throw new Error("Unknown OCR provider");
  }
};

// --- GOOGLE OCR (твой текущий код, НЕ ломаем) ---
async function recognizeGoogle(imagePath) {
  try {
    console.log("OCR provider: GOOGLE");
    console.log("Image path:", imagePath);

    const [result] = await client.textDetection(imagePath);

    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      console.log("OCR: no text detected");
      return '';
    }

    const text = detections[0].description || '';

    console.log("OCR result:", text.substring(0, 100));

    return text;

  } catch (error) {
    console.error("OCR error (Google):", error);
    throw error;
  }
}

// --- YANDEX OCR  ------
async function recognizeYandex(imagePath, { apiKey, folderId }) {
  if (!apiKey) {
    throw new Error("YANDEX_API_KEY is not set");
  }

  if (!folderId) {
    throw new Error("YANDEX_FOLDER_ID is not set");
  }

  const fileContent = fs.readFileSync(imagePath);
  const base64 = fileContent.toString("base64");

  const body = {
    folderId,
    analyzeSpecs: [
      {
        content: base64,
        features: [
          {
            type: "TEXT_DETECTION",
            textDetectionConfig: {
              languageCodes: ["*"]
            }
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

    console.log("VISION RAW:", JSON.stringify(response.data, null, 2));

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

