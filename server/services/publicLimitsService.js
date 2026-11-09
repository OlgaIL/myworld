import { query } from "../db/index.js";
import { GUEST_DOCUMENT_LIMIT } from "../config/env.js";

// Read the same database default used by INSERTs during registration, never a user's balance.
export async function getPublicLimits({ queryImplementation = query, guestLimit = GUEST_DOCUMENT_LIMIT } = {}) {
  let freeProcessingLimit = null;
  try {
    const result = await queryImplementation({ text: `
      select column_default from information_schema.columns
      where table_schema = current_schema() and table_name = 'users'
        and column_name = 'free_processing_limit'
    `, query_timeout: 3000 });
    const value = String(result.rows[0]?.column_default ?? "");
    if (/^\d+$/u.test(value) && Number.isSafeInteger(Number(value))) freeProcessingLimit = Number(value);
  } catch {
    // Public pages remain usable without advertising a guessed registration allowance.
  }
  return { guestDocumentLimit: guestLimit, freeProcessingLimit };
}
