import dotenv from "dotenv";
dotenv.config();

import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "./auth/passport.js";
import { checkDatabaseConnection, isDatabaseConfigured } from "./db/index.js";
import { CLIENT_URL, OCR_PROVIDER, AI_PROVIDER, PROCESSING_ALLOWLIST_EMAILS, PROCESSING_ENABLED, SESSION_SECRET } from "./config/env.js";
import { clientDistDir } from "./config/paths.js";
import authRoutes from "./routes/authRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";
import { GOOGLE_APPLICATION_CREDENTIALS, OPENAI_API_KEY } from "./config/private-env.js";

let databaseStatus = {
  configured: isDatabaseConfigured(),
  connected: false,
  checkedAt: null,
  error: null
};

console.log("GOOGLE_APPLICATION_CREDENTIALS:", GOOGLE_APPLICATION_CREDENTIALS);
console.log("OPENAI:", OPENAI_API_KEY);

const app = express();

app.set("passport", passport);

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: databaseStatus,
    processing: {
      enabled: PROCESSING_ENABLED,
      ocrProvider: OCR_PROVIDER,
      aiProvider: AI_PROVIDER,
      allowlistEnabled: PROCESSING_ALLOWLIST_EMAILS.length > 0
    }
  });
});

app.use(authRoutes);
app.use(photoRoutes);

app.use(express.static(clientDistDir));
app.use((req, res) => res.sendFile(`${clientDistDir}/index.html`));

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
