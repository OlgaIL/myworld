import { query } from "../db/index.js";

export const LLM_SUMMARY_HOURS = new Set([24, 48, 168, 720]);

export async function getLlmAttemptSummary(hours, runQuery = query) {
  if (!LLM_SUMMARY_HOURS.has(hours)) {
    throw new RangeError("Unsupported LLM summary period");
  }

  const result = await runQuery(
    `select audience, provider, trigger,
            count(*)::int as attempts,
            count(*) filter (where outcome = 'success')::int as successes,
            count(*) filter (where outcome = 'timeout')::int as timeouts,
            count(*) filter (where outcome = 'error')::int as other_errors,
            round(avg(duration_ms))::int as average_duration_ms
       from llm_attempt_events
      where started_at >= now() - ($1::int * interval '1 hour')
      group by audience, provider, trigger
      order by audience, provider, trigger`,
    [hours]
  );

  const groups = result.rows.map((row) => ({
    audience: row.audience,
    provider: row.provider,
    trigger: row.trigger,
    attempts: Number(row.attempts),
    successes: Number(row.successes),
    timeouts: Number(row.timeouts),
    otherErrors: Number(row.other_errors),
    averageDurationMs: Number(row.average_duration_ms || 0)
  }));
  const totals = groups.reduce((acc, row) => {
    acc.attempts += row.attempts;
    acc.successes += row.successes;
    acc.timeouts += row.timeouts;
    acc.otherErrors += row.otherErrors;
    return acc;
  }, { attempts: 0, successes: 0, timeouts: 0, otherErrors: 0 });

  return {
    hours,
    totals: {
      ...totals,
      successPercent: totals.attempts ? Math.round(1000 * totals.successes / totals.attempts) / 10 : null
    },
    groups
  };
}
