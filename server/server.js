import "./config/load-env.js";

import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "./auth/passport.js";
import { checkDatabaseConnection, isDatabaseConfigured } from "./db/index.js";
import {
  CLIENT_URL,
  PROCESSING_ALLOWLIST_EMAILS,
  PROCESSING_ENABLED,
  PROCESSING_FREE_MODE,
  PROCESSING_GUEST_MODE,
  PROCESSING_MODE_OVERRIDE,
  PROCESSING_PAID_MODE,
  PROCESSING_STANDARD_AI_PROVIDER,
  PROCESSING_STANDARD_OCR_PROVIDER,
  SESSION_SECRET
} from "./config/env.js";
import { clientDistDir } from "./config/paths.js";
import { getProcessingPipelineForUser } from "./services/processingPipelineService.js";
import authRoutes from "./routes/authRoutes.js";
import accessRequestRoutes from "./routes/accessRequestRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import guestRoutes from "./routes/guestRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";

let databaseStatus = {
  configured: isDatabaseConfigured(),
  connected: false,
  checkedAt: null,
  error: null
};

const app = express();

app.set("passport", passport);

const allowedOrigins = new Set(
  [CLIENT_URL, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean)
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, origin || true);
    }

    return callback(null, false);
  },
  credentials: true
}));
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
      modeOverride: PROCESSING_MODE_OVERRIDE,
      guestMode: PROCESSING_GUEST_MODE,
      freeMode: PROCESSING_FREE_MODE,
      paidMode: PROCESSING_PAID_MODE,
      standardOcrProvider: PROCESSING_STANDARD_OCR_PROVIDER,
      standardAiProvider: PROCESSING_STANDARD_AI_PROVIDER,
      pipelines: {
        guest: getProcessingPipelineForUser(null, { audience: "guest" }),
        free: getProcessingPipelineForUser(null, { audience: "free" }),
        paid: getProcessingPipelineForUser(null, { audience: "paid" })
      },
      allowlistEnabled: PROCESSING_ALLOWLIST_EMAILS.length > 0
    }
  });
});

app.use(authRoutes);
app.use(accessRequestRoutes);
app.use(adminRoutes);
app.use(guestRoutes);
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
