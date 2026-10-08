import { closeDatabaseConnection } from "../db/index.js";
import { cleanupPendingAccountDeletions } from "../services/accountDeletionCleanupService.js";

const args = process.argv.slice(2);
try {
  if (args.length > 1 || (args.length && !["--dry-run", "--apply"].includes(args[0]))) throw new Error("Use --dry-run or --apply");
  console.log(JSON.stringify(await cleanupPendingAccountDeletions({ dryRun: !args.includes("--apply") })));
} catch (error) {
  console.error(JSON.stringify({ action: "account-cleanup-error", code: error.code || "CLEANUP_ERROR" }));
  process.exitCode = 1;
} finally { await closeDatabaseConnection(); }
