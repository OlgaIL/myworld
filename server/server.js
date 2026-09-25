import "./config/load-env.js";

import { checkDatabaseConnection, isDatabaseConfigured } from "./db/index.js";
import { createApp } from "./app.js";

let databaseStatus = {
  configured: isDatabaseConfigured(),
  connected: false,
  checkedAt: null,
  error: null
};

const app = createApp({ getDatabaseStatus: () => databaseStatus });

async function initializeDatabaseStatus() {
  if (!databaseStatus.configured) {
    console.warn("DATABASE_URL is not configured. The app will continue in transitional mode.");
    return;
  }

  try {
    await checkDatabaseConnection();
    databaseStatus = {
      configured: true,
      connected: true,
      checkedAt: new Date().toISOString(),
      error: null
    };
    console.log("PostgreSQL connection OK");
  } catch (error) {
    databaseStatus = {
      configured: true,
      connected: false,
      checkedAt: new Date().toISOString(),
      error: error.message
    };
    console.error("PostgreSQL connection failed:", error.message);
  }
}

await initializeDatabaseStatus();

app.listen(4000, () => console.log("Server running on http://localhost:4000"));
