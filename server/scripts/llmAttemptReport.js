import { closeDatabaseConnection, query } from "../db/index.js";

const days = Number(process.argv[2] || 7);

if (!Number.isInteger(days) || days < 1 || days > 90) {
  console.error("Usage: node scripts/llmAttemptReport.js [days: 1-90]");
  process.exitCode = 1;
} else {
  try {
    const result = await query(
      `select audience, provider, trigger,
              count(*)::int as attempts,
              count(*) filter (where outcome = 'success')::int as successes,
              count(*) filter (where outcome = 'timeout')::int as timeouts,
              count(*) filter (where outcome = 'error')::int as other_errors,
              round(100.0 * count(*) filter (where outcome = 'timeout') / count(*), 2) as timeout_percent,
              round(avg(duration_ms))::int as average_duration_ms
         from llm_attempt_events
        where started_at >= now() - ($1::int * interval '1 day')
        group by audience, provider, trigger
        order by audience, provider, trigger`,
      [days]
    );

    console.log(`LLM attempts in the last ${days} day(s):`);
    console.table(result.rows);
    const totals = result.rows.reduce((acc, row) => {
      acc.attempts += row.attempts;
      acc.successes += row.successes;
      acc.timeouts += row.timeouts;
      acc.otherErrors += row.other_errors;
      return acc;
    }, { attempts: 0, successes: 0, timeouts: 0, otherErrors: 0 });
    const timeoutPercent = totals.attempts
      ? (100 * totals.timeouts / totals.attempts).toFixed(2)
      : "0.00";
    console.log(`Total: ${totals.attempts} attempts, ${totals.successes} successes, ${totals.timeouts} timeouts (${timeoutPercent}%), ${totals.otherErrors} other errors.`);
  } catch (error) {
    console.error("LLM report failed:", error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}
