import crypto from "crypto";

export function createRequestTimer(scope) {
  const requestId = crypto.randomBytes(4).toString("hex");
  const startedAt = Date.now();
  let lastStepAt = startedAt;

  function log(step, details = {}) {
    const now = Date.now();
    const payload = {
      requestId,
      step,
      elapsedMs: now - startedAt,
      stepMs: now - lastStepAt,
      ...details
    };

    lastStepAt = now;
    console.info(`[${scope}]`, JSON.stringify(payload));
  }

  return { requestId, log };
}
