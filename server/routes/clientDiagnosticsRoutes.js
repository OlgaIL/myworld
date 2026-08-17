import { Router } from "express";

const router = Router();
const ALLOWED_EVENTS = new Set(["upload_failed"]);
const MAX_FIELD_LENGTH = 160;
const MAX_DIAGNOSTICS_PER_MINUTE = 30;
const rateLimitBuckets = new Map();

function readString(value, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength)
    : "";
}

function readInteger(value, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function readBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function getClientAddress(req) {
  return String(req.socket?.remoteAddress || "unknown").slice(0, 128);
}

function isWithinRateLimit(req) {
  const address = getClientAddress(req);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(address);

  if (!bucket || now - bucket.startedAt >= 60_000) {
    rateLimitBuckets.set(address, { startedAt: now, count: 1 });
    return true;
  }

  if (bucket.count >= MAX_DIAGNOSTICS_PER_MINUTE) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export function validateClientDiagnostic(body) {
  if (!body || typeof body !== "object" || !ALLOWED_EVENTS.has(body.event)) {
    return null;
  }

  const uploadAttemptId = readString(body.uploadAttemptId, 80);
  const stage = readString(body.stage, 32);
  const mimeType = readString(body.mimeType, 80);
  const errorName = readString(body.errorName, 80);
  const errorCode = readString(body.errorCode, 80);
  const errorMessage = readString(body.errorMessage, MAX_FIELD_LENGTH);
  const platformFamily = readString(body.platformFamily, 24);
  const browserFamily = readString(body.browserFamily, 24);
  const visibilityState = readString(body.visibilityState, 24);
  const connectionType = readString(body.connectionType, 24);
  const status = readInteger(body.status, 0, 599);
  const durationMs = readInteger(body.durationMs, 0, 300_000);
  const preparedSizeBytes = readInteger(body.preparedSizeBytes, 0, 10 * 1024 * 1024);
  const viewportWidth = readInteger(body.viewportWidth, 0, 10_000);
  const viewportHeight = readInteger(body.viewportHeight, 0, 10_000);
  const hasResponse = readBoolean(body.hasResponse);
  const online = readBoolean(body.online);

  if (!uploadAttemptId || !stage || status === null || durationMs === null || preparedSizeBytes === null) {
    return null;
  }

  return {
    event: body.event,
    uploadAttemptId,
    stage,
    status,
    durationMs,
    preparedSizeBytes,
    mimeType,
    errorName,
    errorCode,
    errorMessage,
    hasResponse,
    online,
    visibilityState,
    platformFamily,
    browserFamily,
    viewportWidth,
    viewportHeight,
    connectionType
  };
}

router.post("/api/client-diagnostics", (req, res) => {
  const diagnostic = validateClientDiagnostic(req.body);

  if (!diagnostic || !isWithinRateLimit(req)) {
    return res.status(204).end();
  }

  console.info("[client-diagnostic]", JSON.stringify({
    timestamp: new Date().toISOString(),
    ...diagnostic
  }));

  return res.status(204).end();
});

export default router;
