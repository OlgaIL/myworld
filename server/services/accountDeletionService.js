import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { query, withTransaction } from "../db/index.js";
import { userUploadsDir } from "../config/paths.js";
import { managedFile } from "./guestStorageFiles.js";
import { acquireAccountOperationLock } from "./accountOperationLocks.js";
import { AccountDeletionError, configuredProtection, deletionMessages, protectionReason, validUserId } from "./accountDeletionPolicy.js";

const directories = ["legacy", "guests", "users"];

async function inspectAccount(client, userId, currentUserId, protection) {
  const reason = protectionReason(userId, currentUserId, protection);
  if (reason) return { allowed: false, reason, message: deletionMessages[reason] };
  const ready = await client.query(`select to_regclass('account_deletion_files') is not null
    and exists (select 1 from pg_constraint where conrelid = 'payments'::regclass
      and conname = 'payments_user_id_fkey' and confdeltype = 'r') as ready`);
  if (!ready.rows[0].ready) return { allowed: false, reason: "DELETION_NOT_READY", message: deletionMessages.DELETION_NOT_READY };
  const protectedUsers = await client.query("select count(*)::int as count from users where id = any($1::bigint[])", [protection.ids]);
  if (protectedUsers.rows[0].count !== protection.ids.length) return { allowed: false, reason: "DELETION_PROTECTION_CONFIG", message: deletionMessages.DELETION_PROTECTION_CONFIG };
  const result = await client.query(`select
    exists(select 1 from payments where user_id = $1) as payments,
    exists(select 1 from processing_credit_events where user_id = $1 and (source <> 'manual' or payment_id is not null)) as paid_credits,
    exists(select 1 from photos where user_id = $1 and status = 'processing')
      or exists(select 1 from recognition_improvement_requests where user_id = $1 and status = 'in_review') as busy,
    (select count(*)::int from photos where user_id = $1) as documents_count`, [userId]);
  const state = result.rows[0];
  const blocked = state.payments ? "ACCOUNT_HAS_PAYMENTS" : state.paid_credits ? "ACCOUNT_PAID_CREDITS" : state.busy ? "ACCOUNT_BUSY" : null;
  return { allowed: !blocked, reason: blocked, message: blocked ? deletionMessages[blocked] : "", documentsCount: state.documents_count };
}

export async function getAccountDeletionEligibility(userId, currentUserId = null, { protection = configuredProtection } = {}) {
  if (!validUserId(String(userId))) throw new AccountDeletionError("INVALID_USER_ID", 400);
  return inspectAccount({ query }, String(userId), currentUserId, protection);
}

export async function deleteAccount(userId, confirmationId, currentUserId = null, { protection = configuredProtection, transaction = withTransaction } = {}) {
  const id = String(userId);
  if (!validUserId(id)) throw new AccountDeletionError("INVALID_USER_ID", 400);
  if (typeof confirmationId !== "string" || confirmationId !== id) throw new AccountDeletionError("DELETION_CONFIRMATION_REQUIRED", 400);
  const initialReason = protectionReason(id, currentUserId, protection);
  if (initialReason) throw new AccountDeletionError(initialReason);
  const release = await acquireAccountOperationLock(id, { exclusive: true });
  if (!release) throw new AccountDeletionError("ACCOUNT_BUSY");
  try {
    return await transaction(async (client) => {
      await client.query("set local lock_timeout = '5s'");
      const userResult = await client.query("select id, email from users where id = $1 for update", [id]);
      const user = userResult.rows[0];
      if (!user) throw new AccountDeletionError("USER_NOT_FOUND", 404);
      const eligibility = await inspectAccount(client, id, currentUserId, protection);
      if (!eligibility.allowed) throw new AccountDeletionError(eligibility.reason);

      // Same namespaces as guest processing, cleanup and transition. Transaction
      // locks avoid occupying the guest lock pool for accounts with many sessions.
      const maintenance = await client.query("select pg_try_advisory_xact_lock(731241, hashtext('maintenance')) as locked");
      if (!maintenance.rows[0].locked) throw new AccountDeletionError("ACCOUNT_BUSY");
      const sessions = await client.query(`select s.id, s.converted_user_id from guest_sessions s where s.converted_user_id = $1
        or exists(select 1 from guest_document_claims c where c.guest_session_id = s.id and c.user_id = $1)
        or exists(select 1 from guest_documents d join photos p on p.id = d.claimed_photo_id
          where d.guest_session_id = s.id and p.user_id = $1)
        or exists(select 1 from guest_file_intents i where i.guest_session_id = s.id and i.user_id = $1) order by s.id`, [id]);
      const sessionIds = sessions.rows.map((s) => s.id);
      for (const session of sessions.rows) {
        const lock = await client.query("select pg_try_advisory_xact_lock(731240, hashtext($1)) as locked", [String(session.id)]);
        if (!lock.rows[0].locked) throw new AccountDeletionError("ACCOUNT_BUSY");
        if (session.converted_user_id && String(session.converted_user_id) !== id) throw new AccountDeletionError("ACCOUNT_SHARED_DATA");
      }
      const shared = await client.query(`select exists(select 1 from guest_document_claims
        where guest_session_id = any($2::bigint[]) and user_id <> $1)
        or exists(select 1 from guest_document_claims c join photos p on p.id = c.photo_id
          where (p.user_id = $1 and c.user_id <> $1) or (c.user_id = $1 and p.user_id <> $1))
        or exists(select 1 from guest_documents d join photos p on p.id = d.claimed_photo_id
          where d.guest_session_id = any($2::bigint[]) and p.user_id <> $1)
        or exists(select 1 from recognition_improvement_requests r join photos p on p.id = r.photo_id
          where (p.user_id = $1 and r.user_id <> $1) or (r.user_id = $1 and p.user_id <> $1))
        or exists(select 1 from guest_file_intents where guest_session_id = any($2::bigint[])
          and user_id is not null and user_id <> $1) as shared`, [id, sessionIds]);
      if (shared.rows[0].shared) throw new AccountDeletionError("ACCOUNT_SHARED_DATA");
      const guests = await client.query("select id, filename, guest_session_id, storage_path, status from guest_documents where guest_session_id = any($1::bigint[]) for update", [sessionIds]);
      if (guests.rows.some((d) => d.status === "processing")) throw new AccountDeletionError("ACCOUNT_BUSY");
      const photos = await client.query("select storage_path, status from photos where user_id = $1 for update", [id]);
      if (photos.rows.some((d) => d.status === "processing")) throw new AccountDeletionError("ACCOUNT_BUSY");
      const sources = await client.query(`select source_path as storage_path from guest_document_claims where user_id = $1 and source_path is not null
        union select storage_path from guest_storage_retirements where guest_session_id = any($2::bigint[])`, [id, sessionIds]);
      const intents = await client.query("select * from guest_file_intents where user_id = $1 or guest_session_id = any($2::bigint[]) for update", [id, sessionIds]);
      for (const intent of intents.rows) {
        const lock = await client.query("select pg_try_advisory_xact_lock(731243, hashtext($1)) as locked", [intent.id]);
        if (!lock.rows[0].locked) throw new AccountDeletionError("ACCOUNT_BUSY");
      }
      const intentFiles = intents.rows.flatMap((intent) => [intent.destination_path, intent.temporary_path].filter(Boolean).map((storage_path) => ({ storage_path })));
      const prepared = [];
      const ownedSessions = new Set(sessions.rows.filter((s) => String(s.converted_user_id) === id).map((s) => String(s.id)));
      const uploadNames = await fs.readdir(userUploadsDir);
      for (const document of guests.rows) {
        if (document.status === "claimed" || !ownedSessions.has(String(document.guest_session_id))) continue;
        // A killed claim can leave its deterministic prepared copy or UUID temp
        // before inserting photos. Its still-owned guest row proves provenance;
        // never sweep unrelated files without that row/session relationship.
        const name = `claimed-${document.id}-${path.basename(document.filename)}`;
        for (const candidate of uploadNames) {
          const suffix = candidate.slice(name.length);
          if (candidate === name || (candidate.startsWith(name) && /^\.[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.tmp$/i.test(suffix))) prepared.push({ storage_path: path.join(userUploadsDir, candidate) });
        }
      }
      const paths = [...new Set([...photos.rows, ...guests.rows, ...sources.rows, ...prepared, ...intentFiles].map((d) => path.resolve(d.storage_path)))];
      // Only inspect before commit. No file is removed while the account can
      // still survive a rollback, including a deferred constraint at COMMIT.
      for (const file of paths) {
        try { await managedFile(file, directories); }
        catch (error) {
          if (String(error.code).startsWith("UNSAFE_")) throw new AccountDeletionError("ACCOUNT_UNSAFE_FILES");
          throw error;
        }
      }
      const jobId = crypto.randomUUID();
      await client.query("insert into account_deletion_jobs (id) values ($1)", [jobId]);
      await client.query("insert into account_deletion_files (job_id, storage_path) select $1, unnest($2::text[])", [jobId, paths]);
      await client.query(`delete from notification_outbox where (event_type = 'user_registered' and entity_id = $1)
        or (event_type = 'improvement_requested' and entity_id in (select id from recognition_improvement_requests where user_id = $1))`, [id]);
      await client.query("delete from guest_document_claims where user_id = $1", [id]);
      await client.query("delete from guest_storage_retirements where guest_session_id = any($1::bigint[])", [sessionIds]);
      await client.query("delete from guest_file_intents where user_id = $1 or guest_session_id = any($2::bigint[])", [id, sessionIds]);
      // Revoke the old guest capability too: a later login cannot resurrect
      // unclaimed documents or a prepared claim through the old guest cookie.
      await client.query("delete from guest_sessions where id = any($1::bigint[])", [sessionIds]);
      await client.query("delete from users where id = $1", [id]);
      if (user.email) await client.query(`delete from email_login_codes where email_normalized = lower(trim($1))
        and not exists(select 1 from users where lower(trim(email)) = lower(trim($1)))`, [user.email]);
      if (!paths.length) await client.query("update account_deletion_jobs set completed_at = now() where id = $1", [jobId]);
      return { deleted: true, jobId };
    });
  } catch (error) {
    if (["23503", "23001"].includes(error.code) && error.constraint === "payments_user_id_fkey") throw new AccountDeletionError("ACCOUNT_HAS_PAYMENTS");
    if (error.code === "P0001" && error.message === "ACCOUNT_PAID_CREDITS") throw new AccountDeletionError("ACCOUNT_PAID_CREDITS");
    if (error.code === "55P03" || error.code === "40P01") throw new AccountDeletionError("ACCOUNT_BUSY");
    throw error;
  } finally { await release(); }
}
