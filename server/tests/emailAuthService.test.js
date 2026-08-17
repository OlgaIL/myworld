import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { closeDatabaseConnection, query } from "../db/index.js";
import {
  EmailAuthError,
  hashRequestIp,
  requestEmailLoginCode,
  verifyEmailLoginCode
} from "../services/emailAuthService.js";

const testRun = crypto.randomUUID().replaceAll("-", "");
const createdEmails = [];

function testEmail(label) {
  const email = `email-auth-${label}-${testRun}@example.test`;
  createdEmails.push(email);
  return email;
}

async function requestCode(email) {
  let deliveredCode = "";
  await requestEmailLoginCode({
    email,
    ipHash: hashRequestIp(`test:${email}`),
    sendCode: async ({ code }) => {
      deliveredCode = code;
    }
  });
  return deliveredCode;
}

before(async () => {
  const result = await query("select to_regclass('public.email_login_codes') as table_name");
  assert.equal(result.rows[0].table_name, "email_login_codes", "Run db:migrate before the email auth tests");
});

after(async () => {
  if (createdEmails.length > 0) {
    await query("delete from email_login_codes where email_normalized = any($1::text[])", [createdEmails]);
    await query("delete from users where lower(email) = any($1::text[])", [createdEmails]);
  }
  await closeDatabaseConnection();
});

test("creates a user after a valid one-time code", async () => {
  const email = testEmail("new");
  const code = await requestCode(email);
  const user = await verifyEmailLoginCode({ email, code, legalVersion: "2026-07-15" });

  assert.equal(user.email, email);
  assert.ok(user.email_verified_at);
  assert.equal(user.legal_version, "2026-07-15");

  await assert.rejects(
    () => verifyEmailLoginCode({ email, code, legalVersion: "2026-07-15" }),
    (error) => error instanceof EmailAuthError && error.code === "EMAIL_AUTH_CODE_INVALID"
  );
});

test("uses an existing OAuth account with the same verified email", async () => {
  const email = testEmail("oauth");
  const existing = await query(
    "insert into users (yandex_id, email, display_name) values ($1, $2, $3) returning *",
    [`email-auth-test-${testRun}`, email, "OAuth test"]
  );
  const code = await requestCode(email);
  const user = await verifyEmailLoginCode({ email, code, legalVersion: "2026-07-15" });

  assert.equal(user.id, existing.rows[0].id);
  assert.equal(user.yandex_id, existing.rows[0].yandex_id);
});

test("rejects an expired code", async () => {
  const email = testEmail("expired");
  const code = await requestCode(email);
  await query("update email_login_codes set expires_at = now() - interval '1 minute' where email_normalized = $1", [email]);

  await assert.rejects(
    () => verifyEmailLoginCode({ email, code, legalVersion: "2026-07-15" }),
    (error) => error instanceof EmailAuthError && error.code === "EMAIL_AUTH_CODE_INVALID"
  );
});

test("invalidates the previous code after a resend", async () => {
  const email = testEmail("resend");
  const firstCode = await requestCode(email);
  await query(
    "update email_login_codes set created_at = now() - interval '2 minutes' where email_normalized = $1",
    [email]
  );
  const secondCode = await requestCode(email);

  await assert.rejects(
    () => verifyEmailLoginCode({ email, code: firstCode, legalVersion: "2026-07-15" }),
    (error) => error instanceof EmailAuthError && error.code === "EMAIL_AUTH_CODE_INVALID"
  );

  const user = await verifyEmailLoginCode({ email, code: secondCode, legalVersion: "2026-07-15" });
  assert.equal(user.email, email);
});

test("locks a code after the allowed number of incorrect attempts", async () => {
  const email = testEmail("attempts");
  const code = await requestCode(email);
  const incorrectCode = code === "000000" ? "000001" : "000000";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      () => verifyEmailLoginCode({ email, code: incorrectCode, legalVersion: "2026-07-15" }),
      (error) => error instanceof EmailAuthError && error.code === "EMAIL_AUTH_CODE_INVALID"
    );
  }

  await assert.rejects(
    () => verifyEmailLoginCode({ email, code, legalVersion: "2026-07-15" }),
    (error) => error instanceof EmailAuthError && error.code === "EMAIL_AUTH_CODE_INVALID"
  );
});
