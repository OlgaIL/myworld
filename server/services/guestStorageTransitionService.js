import fs from "node:fs/promises";
import path from "node:path";
import { query, withTransaction } from "../db/index.js";
import { uploadsDir, guestUploadsDir, userUploadsDir, ensurePrivateUploadDirectories } from "../config/paths.js";
import { acquireGuestStorageLock } from "./guestStorageLocks.js";
import { durableCopy, managedFile, removeManagedFile } from "./guestStorageFiles.js";

// Apply only with the app stopped. Cleanup shares the maintenance lock; guest
// session locks additionally protect local concurrent guest work/tests.
export async function transitionGuestStorage({ dryRun = true, copy = durableCopy, remove = removeManagedFile, log = console.log } = {}) {
  const releaseJob = await acquireGuestStorageLock("maintenance", { maintenance: true, tryOnly: true });
  const counts = { planned: 0, changed: 0, retired: 0, orphanLegacy: 0, busy: 0, errors: 0, dryRun };
  if (!releaseJob) return { ...counts, busy: 1 };
  const relative = (file) => path.relative(uploadsDir, file).split(path.sep).join("/");
  try {
    if (!dryRun) ensurePrivateUploadDirectories();
    for (const table of ["photos", "guest_documents"]) {
      let lastId = "0";
      while (true) {
        const batch = await query(`select id, storage_path, ${table === "photos" ? "null::bigint as guest_session_id" : "guest_session_id"} from ${table} where id > $1 order by id limit 100`, [lastId]);
        if (!batch.rows.length) break;
        for (const item of batch.rows) {
          lastId = item.id;
          const release = item.guest_session_id ? await acquireGuestStorageLock(item.guest_session_id, { tryOnly: true }) : async () => {};
          if (!release) { counts.busy++; continue; }
          try {
            await withTransaction(async (client) => {
              const result = await client.query(`select * from ${table} where id = $1 for update`, [item.id]);
              const row = result.rows[0];
              if (!row) return;
              await managedFile(row.storage_path, ["legacy", "guests", "users"]);
              if (table === "guest_documents" && row.status === "claimed") {
                const photos = await client.query("select * from photos where id = $1 for update", [row.claimed_photo_id]);
                const photo = photos.rows[0];
                if (!photo || (!dryRun && path.dirname(photo.storage_path) !== userUploadsDir)) throw Object.assign(new Error("CLAIM_LINK_REQUIRES_REVIEW"), { code: "CLAIM_LINK_REQUIRES_REVIEW" });
                if (!dryRun) await fs.stat(await managedFile(photo.storage_path, ["users"]));
                counts.planned++;
                log(JSON.stringify({ table, id: row.id, source: relative(row.storage_path), action: "keep-claim-metadata-remove-guest-row" }));
                if (dryRun) return;
                await client.query(`insert into guest_document_claims (guest_document_id, guest_session_id, photo_id, user_id, claimed_at, expires_at, source_path)
                  values ($1, $2, $3, $4, coalesce($5, now()), $6::timestamptz + interval '240 hours', $7)
                  on conflict (guest_document_id) do nothing`, [row.id, row.guest_session_id, photo.id, photo.user_id, row.claimed_at, row.created_at, row.storage_path]);
                await client.query("insert into guest_storage_retirements (storage_path) values ($1) on conflict do nothing", [row.storage_path]);
                await client.query("delete from guest_documents where id = $1", [row.id]);
                counts.changed++;
                return;
              }
              const directory = table === "photos" ? userUploadsDir : guestUploadsDir;
              const move = path.dirname(row.storage_path) !== directory;
              const expiryChange = table === "guest_documents" && new Date(row.expires_at).getTime() !== new Date(row.created_at).getTime() + 240 * 3600000;
              if (!move && !expiryChange) return;
              const destination = move ? path.join(directory, `legacy-${table === "photos" ? "photo" : "guest"}-${row.id}-${path.basename(row.storage_path)}`) : row.storage_path;
              counts.planned++;
              log(JSON.stringify({ table, id: row.id, source: relative(row.storage_path), destination: relative(destination), action: move ? "copy-update-retire-when-unreferenced" : "expiry-from-original-upload" }));
              if (dryRun) return;
              if (move) {
                await copy(row.storage_path, destination, undefined, table === "photos"
                  ? { userId: row.user_id }
                  : { guestSessionId: row.guest_session_id, guestDocumentId: row.id,
                    expiresAt: new Date(new Date(row.created_at).getTime() + 240 * 3600000) });
                await client.query(`update ${table} set storage_path = $2 where id = $1`, [row.id, destination]);
                await client.query("insert into guest_storage_retirements (storage_path) values ($1) on conflict do nothing", [row.storage_path]);
              }
              if (table === "guest_documents") await client.query("update guest_documents set expires_at = created_at + interval '240 hours' where id = $1", [row.id]);
              counts.changed++;
            });
          } catch (error) { counts.errors++; log(JSON.stringify({ table, id: item.id, code: error.code || "TRANSITION_ERROR" })); }
          finally { await release(); }
        }
      }
    }
    if (!dryRun) await query(`insert into guest_storage_retirements (storage_path)
      select distinct source_path from guest_document_claims where source_path is not null
      on conflict do nothing`);
    const pending = await query(`select storage_path from guest_storage_retirements
      union select source_path from guest_document_claims where source_path is not null
      order by storage_path`);
    for (const { storage_path: source } of pending.rows) {
      try {
        await managedFile(source, ["legacy", "guests", "users"]);
        const references = await query("select 1 from photos where storage_path = $1 union all select 1 from guest_documents where storage_path = $1 limit 1", [source]);
        log(JSON.stringify({ source: relative(source), action: references.rows.length ? "retain-referenced" : "retire" }));
        if (!dryRun && !references.rows.length) {
          await remove(source, ["legacy", "guests", "users"]);
          await withTransaction(async (client) => {
            await client.query("update guest_document_claims set source_path = null where source_path = $1", [source]);
            await client.query("delete from guest_storage_retirements where storage_path = $1", [source]);
          });
          counts.retired++;
        }
      } catch (error) { counts.errors++; log(JSON.stringify({ code: error.code || "RETIRE_ERROR" })); }
    }
    // Unknown root files are reported, never deleted by inference.
    for (const item of await fs.readdir(uploadsDir, { withFileTypes: true })) {
      if (!item.isFile()) continue;
      const source = path.join(uploadsDir, item.name);
      const references = await query("select 1 from photos where storage_path = $1 union all select 1 from guest_documents where storage_path = $1 union all select 1 from guest_storage_retirements where storage_path = $1 limit 1", [source]);
      if (!references.rows.length) { counts.orphanLegacy++; log(JSON.stringify({ source: relative(source), action: "unreferenced-manual-review" })); }
    }
    return counts;
  } finally { await releaseJob(); }
}
