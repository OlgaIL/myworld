import dotenv from "dotenv";
import { checkDatabaseConnection, closeDatabaseConnection, isDatabaseConfigured } from "./index.js";

dotenv.config();

try {
  if (!isDatabaseConfigured()) {
    console.log("Database is not configured. Add DATABASE_URL to server/.env.");
    process.exit(0);
  }

  const result = await checkDatabaseConnection();
  console.log(`Database connection OK at ${result.current_time.toISOString()}`);
} catch (error) {
  console.error("Database connection failed:", error.message);
  process.exitCode = 1;
} finally {
  await closeDatabaseConnection();
}
