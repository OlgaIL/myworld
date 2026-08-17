import crypto from "node:crypto";
import { query, withTransaction } from "../db/index.js";
import {
  EMAIL_AUTH_CODE_TTL_MINUTES,
  EMAIL_AUTH_EMAIL_REQUESTS_PER_HOUR,
  EMAIL_AUTH_IP_REQUESTS_PER_HOUR,
  EMAIL_AUTH_MAX_ATTEMPTS,
  EMAIL_AUTH_RESEND_SECONDS
} from "../config/env.js";
import { EMAIL_OTP_SECRET } from "../config/private-env.js";
import { sendEmailLoginCode } from "./emailDeliveryService.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailAuthError extends Error {
  constructor(code, status = 400, retryAfterSeconds = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 320 && EMAIL_PATTERN.test(email) ? email : null;
}

function hmac(value) {
  return crypto.createHmac("sha256", EMAIL_OTP_SECRET).update(value).digest("hex");
}

function hashCode(email, code) {
  return hmac(`code:${email}:${code}`);
}

export function hashRequestIp(ip) {
  return hmac(`ip:${ip || "unknown"}`);
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function safeHashEqual(first, second) {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

export async function requestEmailLoginCode({ email, ipHash, sendCode = sendEmailLoginCode }) {
  const code = generateCode();
  const codeHash = hashCode(email, code);
  const ttlMinutes = positiveInteger(EMAIL_AUTH_CODE_TTL_MINUTES, 10);
  const resendSeconds = Math.max(10, positiveInteger(EMAIL_AUTH_RESEND_SECONDS, 60));
  const maxAttempts = positiveInteger(EMAIL_AUTH_MAX_ATTEMPTS, 5);
  const emailRequestsPerHour = positiveInteger(EMAIL_AUTH_EMAIL_REQUESTS_PER_HOUR, 5);
  const ipRequestsPerHour = positiveInteger(EMAIL_AUTH_IP_REQUESTS_PER_HOUR, 20);

  const codeRecord = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`email-auth:${email}`]);

    const rateResult = await client.query(
      `
        select
          count(*) filter (where email_normalized = $1)::int as email_requests,
          count(*) filter (where request_ip_hash = $2)::int as ip_requests,
          max(created_at) filter (where email_normalized = $1) as last_email_request
        from email_login_codes
        where created_at > now() - interval '1 hour'
      `,
      [email, ipHash]
    );
    const rate = rateResult.rows[0];
    const lastRequestAt = rate.last_email_request ? new Date(rate.last_email_request).getTime() : 0;
    const elapsedSeconds = lastRequestAt ? Math.floor((Date.now() - lastRequestAt) / 1000) : resendSeconds;

    if (elapsedSeconds < resendSeconds) {
      throw new EmailAuthError("EMAIL_AUTH_RATE_LIMITED", 429, resendSeconds - elapsedSeconds);
    }

    if (Number(rate.email_requests) >= emailRequestsPerHour
      || Number(rate.ip_requests) >= ipRequestsPerHour) {
      throw new EmailAuthError("EMAIL_AUTH_RATE_LIMITED", 429, 3600);
    }

    await client.query(
      "update email_login_codes set consumed_at = now() where email_normalized = $1 and consumed_at is null",
      [email]
    );

    const result = await client.query(
      `
        insert into email_login_codes (
          email_normalized,
          code_hash,
          request_ip_hash,
          expires_at,
          attempts_remaining
        )
        values ($1, $2, $3, now() + ($4 * interval '1 minute'), $5)
        returning id
      `,
      [email, codeHash, ipHash, ttlMinutes, maxAttempts]
    );

    return result.rows[0];
  });

  try {
    await sendCode({ email, code, ttlMinutes });
  } catch (error) {
    await query("update email_login_codes set consumed_at = now() where id = $1", [codeRecord.id]);
    console.error("Email auth delivery failed:", error.message);
    throw new EmailAuthError("EMAIL_AUTH_DELIVERY_FAILED", 503);
  }

  query("delete from email_login_codes where created_at < now() - interval '2 days'").catch(() => {});

  return { retryAfterSeconds: resendSeconds };
}

export async function verifyEmailLoginCode({ email, code, legalVersion }) {
  const submittedHash = hashCode(email, code);

  const verification = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`email-auth:${email}`]);

    const codeResult = await client.query(
      `
        select *
        from email_login_codes
        where email_normalized = $1 and consumed_at is null
        order by created_at desc
        limit 1
        for update
      `,
      [email]
    );
    const codeRecord = codeResult.rows[0];

    if (!codeRecord || new Date(codeRecord.expires_at).getTime() <= Date.now() || codeRecord.attempts_remaining <= 0) {
      return { error: "EMAIL_AUTH_CODE_INVALID" };
    }

    if (!safeHashEqual(codeRecord.code_hash, submittedHash)) {
      await client.query(
        `
          update email_login_codes
          set
            attempts_remaining = greatest(attempts_remaining - 1, 0),
            consumed_at = case when attempts_remaining <= 1 then now() else consumed_at end
          where id = $1
        `,
        [codeRecord.id]
      );
      return { error: "EMAIL_AUTH_CODE_INVALID" };
    }

    const existingResult = await client.query(
      "select * from users where lower(email) = $1 order by created_at asc limit 1 for update",
      [email]
    );
    let user = existingResult.rows[0];

    if (user) {
      const updatedResult = await client.query(
        `
          update users
          set
            email = $2,
            email_verified_at = coalesce(email_verified_at, now()),
            legal_accepted_at = now(),
            legal_version = $3,
            updated_at = now()
          where id = $1
          returning *
        `,
        [user.id, email, legalVersion]
      );
      user = updatedResult.rows[0];
    } else {
      const displayName = email.split("@")[0].slice(0, 120) || "User";
      const insertedResult = await client.query(
        `
          insert into users (
            email,
            email_verified_at,
            display_name,
            legal_accepted_at,
            legal_version
          )
          values ($1, now(), $2, now(), $3)
          returning *
        `,
        [email, displayName, legalVersion]
      );
      user = insertedResult.rows[0];
    }

    await client.query(
      "update email_login_codes set consumed_at = now() where email_normalized = $1 and consumed_at is null",
      [email]
    );

    return { user };
  });

  if (verification.error) {
    throw new EmailAuthError(verification.error, 400);
  }

  return verification.user;
}
