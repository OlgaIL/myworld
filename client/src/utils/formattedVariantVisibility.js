import { arePlainParagraphsIdentical, canAssessFormattedDuplicate } from "../../../shared/formattedVariantRules.mjs";

export function isRedundantFormattedVariant({
  content, text, isAuthenticated, formattedIsRedundant,
  status, enrichmentPending, hasTable, tableStatus, tableContent
}) {
  if (!canAssessFormattedDuplicate({ status, enrichmentPending, hasTable, tableStatus, tableContent })) return false;
  // Guests receive a server-computed flag, never need protected blocks to decide.
  if (!isAuthenticated) return formattedIsRedundant === true;
  return arePlainParagraphsIdentical(content, text);
}
