import dotenv from "dotenv";
dotenv.config({ quiet: true });
globalThis.__myworldEnvLoaded = true;
const { transitionGuestStorage } = await import("../services/guestStorageTransitionService.js");
const { closeDatabaseConnection } = await import("../db/index.js");
const { closeGuestStorageLocks } = await import("../services/guestStorageLocks.js");
const { closeFileIntentLocks } = await import("../repositories/guestFileIntentsRepository.js");
const { closeAccountOperationLocks } = await import("../services/accountOperationLocks.js");

const args = process.argv.slice(2);
try {
  if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Use --dry-run (default) or --apply with the app stopped");
  const result = await transitionGuestStorage({ dryRun: !args.includes("--apply") });
  console.log(JSON.stringify(result));
  if (result.errors || result.busy) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ code: error.code || "TRANSITION_FAILED" }));
  process.exitCode = 1;
} finally {
  await closeGuestStorageLocks();
  await closeFileIntentLocks();
  await closeAccountOperationLocks();
  await closeDatabaseConnection();
}
