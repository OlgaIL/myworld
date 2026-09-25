import fs from "fs";
import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "./auth/passport.js";
import {
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
import paymentRoutes from "./routes/paymentRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";
import processingHistoryRoutes from "./routes/processingHistoryRoutes.js";
import clientDiagnosticsRoutes from "./routes/clientDiagnosticsRoutes.js";
import improvementRequestRoutes from "./routes/improvementRequestRoutes.js";
import { buildCorsOptions } from "./middleware/corsOptions.js";
import {
  buildNotFoundHtml,
  buildRobotsTxt,
  buildSitemapXml,
  injectSeoHead,
  isFrontendPagePath,
  isPrivatePagePath,
  isPublicPagePath,
  isServicePath
} from "./seo.js";

const EMPTY_DATABASE_STATUS = {
  configured: false,
  connected: false,
  checkedAt: null,
  error: null
};

function normalizePageUrl(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  const requestUrl = new URL(req.originalUrl, "http://localhost");
  let pathname = requestUrl.pathname;
  let shouldRedirect = false;

  if (pathname !== "/" && pathname.endsWith("/")) {
    const pathWithoutTrailingSlash = pathname.slice(0, -1);
    if (isFrontendPagePath(pathWithoutTrailingSlash)) {
      pathname = pathWithoutTrailingSlash;
      shouldRedirect = true;
    }
  }

  if (isFrontendPagePath(pathname) && requestUrl.searchParams.has("etext")) {
    requestUrl.searchParams.delete("etext");
    shouldRedirect = true;
  }

  if (!shouldRedirect) {
    return next();
  }

  requestUrl.pathname = pathname;
  return res.redirect(301, `${requestUrl.pathname}${requestUrl.search}`);
}

export function createApp({
  clientDistDirectory = clientDistDir,
  getDatabaseStatus = () => EMPTY_DATABASE_STATUS
} = {}) {
  const app = express();

  app.set("passport", passport);

  app.use(cors(buildCorsOptions()));
  app.use(express.json());
  app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(normalizePageUrl);
  app.use((req, res, next) => {
    if (isServicePath(req.path)) {
      res.set("X-Robots-Tag", "noindex, nofollow");
    }
    next();
  });

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(buildRobotsTxt());
  });

  app.get("/sitemap.xml", (req, res) => {
    res.type("application/xml").send(buildSitemapXml());
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      database: getDatabaseStatus(),
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
  app.use(clientDiagnosticsRoutes);
  app.use(accessRequestRoutes);
  app.use(adminRoutes);
  app.use(guestRoutes);
  app.use(paymentRoutes);
  app.use(photoRoutes);
  app.use(processingHistoryRoutes);
  app.use(improvementRequestRoutes);

  app.use(express.static(clientDistDirectory, { index: false }));

  app.use((req, res) => {
    if (isServicePath(req.path)) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    if (isPublicPagePath(req.path) || isPrivatePagePath(req.path)) {
      const indexHtml = fs.readFileSync(`${clientDistDirectory}/index.html`, "utf8");
      if (isPrivatePagePath(req.path)) {
        res.set("X-Robots-Tag", "noindex, nofollow");
      }
      return res.type("html").send(injectSeoHead(indexHtml, req.path));
    }

    return res.status(404).type("html").send(buildNotFoundHtml());
  });

  return app;
}
