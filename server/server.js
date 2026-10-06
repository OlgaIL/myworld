import "./config/load-env.js";

import { checkDatabaseConnection, isDatabaseConfigured } from "./db/index.js";
import { createApp } from "./app.js";
import { TELEGRAM_EVENTS_CHAT_ID } from "./config/env.js";
import { TELEGRAM_BOT_TOKEN } from "./config/private-env.js";
import { startTelegramNotificationWorker } from "./services/telegramNotificationsService.js";

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

if (databaseStatus.connected) {
  startTelegramNotificationWorker({ token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_EVENTS_CHAT_ID });
}

app.listen(4000, () => console.log("Server running on http://localhost:4000"));
