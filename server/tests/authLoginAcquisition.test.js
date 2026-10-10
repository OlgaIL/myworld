import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, mock, test } from "node:test";
import dotenv from "dotenv";
import pg from "pg";
import express from "express";
import session from "express-session";
import passportModule from "passport";
import nodemailer from "nodemailer";
import { captureAcquisitionContext } from "../../client/src/services/analytics.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
const dbUrl = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname), "Auth regression tests require local PostgreSQL");
const database = `auth_acquisition_test_${crypto.randomUUID().replaceAll("-", "")}`;
// Never migrate or write to the configured application database.
const bootstrapUrl = new URL(dbUrl);
bootstrapUrl.pathname = "/postgres";
const bootstrap = new pg.Pool({ connectionString: bootstrapUrl.toString() });
dbUrl.pathname = `/${database}`;
process.env.DATABASE_URL = dbUrl.toString();
Object.assign(process.env, {
  AUTH_PROVIDERS: "email,google,yandex,vk", EMAIL_AUTH_ENABLED: "true",
  GOOGLE_AUTH_ENABLED: "true", YANDEX_AUTH_ENABLED: "true", VK_AUTH_ENABLED: "true",
  GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test",
  YANDEX_CLIENT_ID: "test", YANDEX_CLIENT_SECRET: "test",
  VK_CLIENT_ID: "test", VK_CLIENT_SECRET: "test",
  SMTP_HOST: "localhost", SMTP_USER: "test", SMTP_PASSWORD: "test", SMTP_FROM: "test@example.test",
  EMAIL_OTP_SECRET: "local-auth-regression-secret", CLIENT_URL: "http://localhost/login-complete",
  OPENAI_API_KEY: "", YANDEX_API_KEY: "", TELEGRAM_BOT_TOKEN: "", PROCESSING_ENABLED: "false"
});
globalThis.__myworldEnvLoaded = true;
const deliveredCodes = new Map();
mock.method(nodemailer, "createTransport", () => ({
  sendMail: async ({ to, text }) => { deliveredCodes.set(to, text.match(/\b\d{6}\b/)[0]); }
}));

const { query, closeDatabaseConnection } = await import("../db/index.js");
const { closeGuestStorageLocks } = await import("../services/guestStorageLocks.js");
const { closeAccountOperationLocks } = await import("../services/accountOperationLocks.js");
const { closeFileIntentLocks } = await import("../repositories/guestFileIntentsRepository.js");
const { guestUploadsDir, ensurePrivateUploadDirectories } = await import("../config/paths.js");
const authRoutes = (await import("../routes/authRoutes.js")).default;
let appServer, baseUrl, databaseCreated = false, oauthUser;
const files = new Set();

before(async () => {
  await bootstrap.query(`create database ${database}`);
  databaseCreated = true;
  for (const name of (await fs.readdir(path.join(serverDir, "db/migrations"))).filter((name) => name.endsWith(".sql")).sort()) {
    await query(await fs.readFile(path.join(serverDir, "db/migrations", name), "utf8"));
  }
  ensurePrivateUploadDirectories();
  const passport = new passportModule.Passport();
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, (await query("select * from users where id=$1", [id])).rows[0]); }
    catch (error) { done(error); }
  });
  class LocalOAuthStrategy extends passportModule.Strategy {
    authenticate() { this.success(oauthUser); }
  }
  for (const provider of ["google", "yandex", "vk"]) passport.use(provider, new LocalOAuthStrategy());
  const app = express();
  app.set("passport", passport);
  app.use(express.json());
  app.use(session({ secret: "local-test-session", resave: false, saveUninitialized: false }));
  app.use(passport.initialize());
  app.use(passport.session());
  // Test-only endpoints expose the session boundary and seed hostile/unrelated fields.
  app.post("/test/session", (req, res) => {
    Object.assign(req.session, req.body);
    res.json({ sessionId: req.sessionID });
  });
  app.get("/test/session", (req, res) => res.json({ sessionId: req.sessionID, session: req.session, userId: req.user?.id }));
  app.use(authRoutes);
  appServer = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  baseUrl = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
  if (appServer) await new Promise((resolve) => appServer.close(resolve));
  await closeGuestStorageLocks();
  await closeAccountOperationLocks();
  await closeFileIntentLocks();
  if (databaseCreated) {
    for (const row of (await query("select storage_path from photos union select storage_path from guest_documents")).rows) {
      if (path.isAbsolute(row.storage_path)) files.add(row.storage_path);
    }
  }
  await closeDatabaseConnection();
  if (databaseCreated) await bootstrap.query(`drop database ${database}`);
  await bootstrap.end();
  for (const file of files) await fs.unlink(file).catch((error) => { if (error.code !== "ENOENT") throw error; });
  mock.restoreAll();
});

function visitor(guestToken = "") {
  let authCookie = "";
  return async (route, body) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method: body === undefined ? "GET" : "POST", redirect: "manual",
      headers: { "Content-Type": "application/json", Cookie: [authCookie, guestToken && `guest_session_token=${guestToken}`].filter(Boolean).join("; ") },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const cookie = response.headers.getSetCookie().find((value) => value.startsWith("connect.sid="));
    if (cookie) authCookie = cookie.split(";")[0];
    return response;
  };
}

const identity = { metrikaClientId: "123456789", deviceType: "mobile", deviceOs: "android", deviceBrowser: "yandex" };
const acquisition = { utm_source: "manual_test", utm_campaign: "check_A", landing_path: "/photo-to-text?utm_campaign=check_A" };

async function emailLogin(request, email, context = acquisition, analyticsIdentity = identity) {
  const requested = await request("/api/auth/email/request", { email, acquisitionContext: context, analyticsIdentity });
  assert.equal(requested.status, 200);
  const beforeLogin = await (await request("/test/session")).json();
  const verified = await request("/api/auth/email/verify", {
    email, code: deliveredCodes.get(email), legalAccepted: true, legalVersion: "2026-07-15"
  });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { ok: true });
  const afterLogin = await (await request("/test/session")).json();
  assert.notEqual(afterLogin.sessionId, beforeLogin.sessionId, "Passport must regenerate the anonymous session");
  assert.equal(afterLogin.session.unrelated, undefined);
  assert.equal(afterLogin.session.acquisitionContext, undefined);
  assert.equal(afterLogin.session.analyticsIdentity, undefined);
  return (await query("select * from users where id=$1", [afterLogin.userId])).rows[0];
}

test("email signup preserves first touch A through B and claims the guest document after session regeneration", async () => {
  const guest = (await query("insert into guest_sessions (session_token) values ($1) returning *", [crypto.randomUUID()])).rows[0];
  const filename = `${database}.jpg`;
  const storagePath = path.join(guestUploadsDir, filename);
  files.add(storagePath);
  await fs.writeFile(storagePath, "synthetic guest image");
  const document = (await query(`insert into guest_documents
    (guest_session_id, filename, storage_path, status, ocr_text, clean_text, title, expires_at)
    values ($1,$2,$3,'processed','synthetic OCR','synthetic text','synthetic title',now()+interval '1 day') returning *`,
  [guest.id, filename, storagePath])).rows[0];
  const originalWindow = globalThis.window;
  let first;
  try {
    const values = new Map();
    globalThis.window = {
      localStorage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
      location: { pathname: "/photo-to-text", search: "?utm_source=manual_test&utm_campaign=check_A&utm_content=ad_A" }
    };
    first = captureAcquisitionContext("photo_to_text");
    window.location.search = "?utm_campaign=check_B&utm_content=ad_B";
    assert.deepEqual(captureAcquisitionContext("other"), first);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
  const request = visitor(guest.session_token);
  await request("/test/session", { unrelated: "must not survive" });
  const user = await emailLogin(request, `${database}@example.test`, { ...first, email: "unsafe@example.test" }, { ...identity, secret: "unsafe" });
  assert.deepEqual(user.acquisition_context, first);
  assert.equal(user.metrika_client_id, identity.metrikaClientId);
  assert.equal(user.first_device_type, "mobile");
  const claim = (await query("select * from guest_document_claims where guest_document_id=$1", [document.id])).rows[0];
  assert.equal(claim.user_id, user.id);
  const photo = (await query("select * from photos where id=$1", [claim.photo_id])).rows[0];
  files.add(photo.storage_path);
  assert.equal(photo.user_id, user.id);
  assert.equal(photo.clean_text, "synthetic text");
  assert.equal(await fs.readFile(photo.storage_path, "utf8"), "synthetic guest image");
  assert.equal((await query("select converted_user_id from guest_sessions where id=$1", [guest.id])).rows[0].converted_user_id, user.id);
});

test("all OAuth callbacks preserve only sanitized analytics through real Passport login", async () => {
  for (const provider of ["google", "yandex", "vk"]) {
    oauthUser = (await query("insert into users (email, display_name) values ($1,'Synthetic OAuth') returning *", [`${provider}-${database}@example.test`])).rows[0];
    const request = visitor();
    const seeded = await (await request("/test/session", {
      unrelated: "must not survive", acquisitionContext: { ...acquisition, email: "unsafe", utm_term: ["unsafe"] },
      analyticsIdentity: { ...identity, deviceOs: "unsafe", secret: "unsafe" }
    })).json();
    const response = await request(`/auth/${provider}/callback`);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "http://localhost/login-complete");
    const current = await (await request("/test/session")).json();
    assert.notEqual(current.sessionId, seeded.sessionId);
    assert.equal(current.session.unrelated, undefined);
    assert.equal(current.session.acquisitionContext, undefined);
    assert.equal(current.session.analyticsIdentity, undefined);
    const user = (await query("select * from users where id=$1", [oauthUser.id])).rows[0];
    assert.deepEqual(user.acquisition_context, acquisition);
    assert.equal(user.metrika_client_id, identity.metrikaClientId);
    assert.equal(user.first_device_os, null);
  }
});

test("returning email user retains original acquisition and ClientID", async () => {
  const email = `returning-${database}@example.test`;
  const first = await emailLogin(visitor(), email);
  await query("update email_login_codes set created_at=now()-interval '2 minutes' where email_normalized=$1", [email]);
  const second = await emailLogin(visitor(), email, { utm_campaign: "check_B" }, { ...identity, metrikaClientId: "987654321" });
  assert.equal(second.id, first.id);
  assert.deepEqual(second.acquisition_context, acquisition);
  assert.equal(second.metrika_client_id, identity.metrikaClientId);
});

test("signup without attribution does not invent a source", async () => {
  const user = await emailLogin(visitor(), `empty-${database}@example.test`, {}, {});
  assert.equal(user.acquisition_context, null);
  assert.equal(user.metrika_client_id, null);
});
