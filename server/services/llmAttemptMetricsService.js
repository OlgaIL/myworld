import { query } from "../db/index.js";

export function classifyLlmOutcome(result) {
  if (!result?.error) return "success";
  return result.failureKind === "timeout" ? "timeout" : "error";
}

export async function runMeasuredLlmAttempt({ pipeline, trigger, inputKind, execute, persist = query }) {
  const startedAt = new Date();
  const startedTime = Date.now();
  let result;
  let thrownError;

  try {
    result = await execute();
    return result;
  } catch (error) {
    thrownError = error;
    throw error;
  } finally {
    const outcome = thrownError ? "error" : classifyLlmOutcome(result);

    try {
      await persist(
        `insert into llm_attempt_events
          (started_at, audience, pipeline, provider, trigger, input_kind, outcome, duration_ms)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          startedAt,
          pipeline.audience,
          pipeline.pipeline,
          pipeline.aiProvider,
          trigger,
          inputKind,
          outcome,
          Math.max(0, Date.now() - startedTime)
        ]
      );
    } catch (error) {
      console.error("[llm-attempt-metrics] write failed", { code: error?.code || "UNKNOWN" });
    }
  }
}
