import "./load-env.js";
import { getTimewebOptions } from "../services/processingPipelineService.js";

export function getDocumentTableOptions(env=process.env) {
  const primary = getTimewebOptions();
  return { ...primary,
    pageInventory:env.TABLE_PAGE_INVENTORY_ENABLED === "true",
    timeoutMs:Number(env.TABLE_TIMEOUT_MS||60000),maxTokens:Number(env.TABLE_MAX_TOKENS||Math.max(primary.maxTokens,6000)),
    inputRubPerMillion:Number(env.TABLE_PRIMARY_INPUT_RUB_PER_MILLION||NaN),
    outputRubPerMillion:Number(env.TABLE_PRIMARY_OUTPUT_RUB_PER_MILLION||NaN) };
}
