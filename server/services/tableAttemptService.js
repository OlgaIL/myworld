import { query } from "../db/index.js";
import { TABLE_ATTEMPT_LIMIT } from "../config/tableLimits.js";
import { LLM_SUMMARY_HOURS } from "./llmAttemptSummaryService.js";

export async function reserveTableAttempt(photoId, userId, runQuery = query) {
  const result = await runQuery(`with reserved as (
    update photos set table_attempts = table_attempts + 1
     where id = $1 and user_id = $2 and table_attempts < $3 and table_status <> 'ready'
     returning id, table_attempts
  ), event as (
    insert into table_processing_attempts (photo_id) select id from reserved returning id
  ) select event.id, reserved.table_attempts from event cross join reserved`, [photoId, userId, TABLE_ATTEMPT_LIMIT]);
  return result.rows[0] || null;
}

export async function finishTableAttempt(id, result, durationMs, runQuery = query) {
  await runQuery(`update table_processing_attempts set finished_at = now(), outcome = $2,
    result_status = $3, error_code = $4, duration_ms = $5, model = $6, provider = $7,
    model_calls = $8, input_tokens = $9, output_tokens = $10, estimated_cost_rub = $11,
    unverified_cells = $12, validation_diagnostic = $13::jsonb where id = $1 and outcome = 'running'`,
  [id, result.status === "ready" ? "success" : "failure", result.status,
    /^[A-Z0-9_]{1,80}$/u.test(result.code || "") ? result.code : null, Math.max(0, Math.round(durationMs)),
    result.modelStartedAt?String(result.model||"").slice(0,120):null,result.modelStartedAt?"timeweb":null,
    result.modelStartedAt?(result.modelCalls ?? 1):0,result.inputTokens??null,result.outputTokens??null,result.estimatedCostRub??null,
    (result.content?.blocks||[]).reduce((n,block)=>n+(block.unverifiedCells?.length||0),0),
    result.validationDiagnostic ? JSON.stringify(result.validationDiagnostic) : null]);
}

export async function getTableAttemptSummary(hours, runQuery = query) {
  if (!LLM_SUMMARY_HOURS.has(hours)) throw new RangeError("Unsupported period");
  const result = await runQuery(`select count(*)::int as attempts,
    count(*) filter (where outcome = 'success')::int as successes,
    count(*) filter (where outcome = 'failure')::int as failures,
    count(*) filter (where outcome = 'running' and started_at >= now() - interval '1 hour')::int as pending,
    count(*) filter (where outcome = 'running' and started_at < now() - interval '1 hour')::int as unfinished
    from table_processing_attempts where started_at >= now() - ($1::int * interval '1 hour')`, [hours]);
  const models=await runQuery(`select model, provider, sum(model_calls)::int as calls,
    coalesce(sum(input_tokens),0)::bigint as input_tokens, coalesce(sum(output_tokens),0)::bigint as output_tokens,
    sum(estimated_cost_rub) as estimated_cost_rub,
    count(*) filter (where model_calls > 0 and estimated_cost_rub is null)::int as unknown_cost_calls
    from table_processing_attempts where started_at >= now() - ($1::int * interval '1 hour')
      and model_calls > 0 group by model, provider order by model`,[hours]);
  return { hours, ...Object.fromEntries(["attempts", "successes", "failures", "pending", "unfinished"]
    .map((key) => [key, Number(result.rows[0]?.[key] || 0)])),
    models:models.rows.filter(row=>row.model).map(row=>({model:row.model,provider:row.provider,
      calls:Number(row.calls),inputTokens:Number(row.input_tokens),outputTokens:Number(row.output_tokens),
      estimatedCostRub:row.estimated_cost_rub===null?null:Number(row.estimated_cost_rub),unknownCostCalls:Number(row.unknown_cost_calls)})) };
}
