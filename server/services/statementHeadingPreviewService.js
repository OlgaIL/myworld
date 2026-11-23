// Pure preview plus an explicit local-only integration for ordinary uploads.
import { proposeStatementHeadingOrder } from '../utils/statementHeadingOrder.js';
import { formattedContentToText } from '../utils/textCorrections.js';

export function previewStatementHeadingOrder(result, layout, { sourceText, sourceVerified = false } = {}) {
  if (!result || result.error) return { status: 'not_applicable', reason: 'formatting_failed', result };
  const proposal = proposeStatementHeadingOrder({ content: result.formattedContent, layout,
    sourceText, sourceVerified, corrections: result.corrections });
  return { ...proposal, result: proposal.status === 'changed' ? { ...result,
    formattedContent: proposal.content, cleanText: formattedContentToText(proposal.content) } : result };
}

export function isLocalStatementHeadingOrderEnabled(env = process.env) {
  if (env.LOCAL_STATEMENT_HEADING_ORDER_ENABLED !== 'true' || env.NODE_ENV === 'production') return false;
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.DATABASE_URL).hostname); }
  catch { return false; }
}

// An explicit release switch is required outside the original local trial.
export function isStatementHeadingOrderEnabled(env = process.env) {
  if (env.STATEMENT_HEADING_ORDER_ENABLED !== undefined) return env.STATEMENT_HEADING_ORDER_ENABLED === 'true';
  return isLocalStatementHeadingOrderEnabled(env);
}

export function applyStatementHeadingOrder(sourceText, result, layout,
  { pipeline, sourceVerified = false, env = process.env } = {}) {
  if (!isStatementHeadingOrderEnabled(env) || pipeline?.pipeline !== 'standard'
    || pipeline?.ocrProvider !== 'google' || !sourceVerified || !result || result.error
    || result.formattedContent?.requisiteLayout) return result;
  try { return previewStatementHeadingOrder(result, layout, { sourceText, sourceVerified }).result; }
  catch { return result; }
}

// Retain the local prototype API for saved review scripts/tests.
export const applyLocalStatementHeadingOrder = applyStatementHeadingOrder;
