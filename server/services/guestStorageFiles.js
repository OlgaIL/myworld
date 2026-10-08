import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { uploadsDir } from "../config/paths.js";
import { query } from "../db/index.js";
import { beginFileIntent, cancelFileIntent } from "../repositories/guestFileIntentsRepository.js";
import { acquireAccountOperationLock } from "./accountOperationLocks.js";

// Only flat regular files in explicitly allowed managed directories. Never
// traverse links, arbitrary DB paths, or recursively delete directories.
export async function managedFile(storagePath, allowed = ["guests"], root = uploadsDir) {
  const candidate = path.resolve(storagePath);
  const relative = path.relative(root, candidate);
  const parts = relative.split(path.sep);
  const directory = parts.length === 1 ? "legacy" : parts[0];
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)
    || !allowed.includes(directory) || parts.length !== (directory === "legacy" ? 1 : 2)) {
    throw Object.assign(new Error("UNSAFE_STORAGE_PATH"), { code: "UNSAFE_STORAGE_PATH" });
  }
  for (const parent of directory === "legacy" ? [root] : [root, path.join(root, directory)]) {
    const stat = await fs.lstat(parent);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Object.assign(new Error("UNSAFE_STORAGE_DIRECTORY"), { code: "UNSAFE_STORAGE_DIRECTORY" });
  }
  try {
    const stat = await fs.lstat(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) throw Object.assign(new Error("UNSAFE_STORAGE_FILE"), { code: "UNSAFE_STORAGE_FILE" });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return candidate;
}

export async function removeManagedFile(storagePath, allowed = ["guests"], root = uploadsDir) {
  const candidate = await managedFile(storagePath, allowed, root);
  try { await fs.unlink(candidate); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

export async function durableCopy(source, destination, root = uploadsDir, context = {}) {
  await managedFile(source, ["legacy", "guests", "users"], root);
  await managedFile(destination, ["guests", "users"], root);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  await managedFile(temporary, ["guests", "users"], root);
  if (root !== uploadsDir) throw Object.assign(new Error("UNREGISTERED_COPY_ROOT"), { code: "UNREGISTERED_COPY_ROOT" });
  const ownership = await query(`select d.id as document_id, d.guest_session_id, s.converted_user_id as user_id, d.expires_at
    from guest_documents d join guest_sessions s on s.id = d.guest_session_id where d.storage_path = $1
    union all select null::bigint, null::bigint, p.user_id, now() + interval '240 hours'
    from photos p where p.storage_path = $1 limit 1`, [source]);
  const owner = ownership.rows[0];
  if (!owner) throw Object.assign(new Error("UNTRACKED_COPY_SOURCE"), { code: "UNTRACKED_COPY_SOURCE" });
  const userId = context.userId ?? owner.user_id;
  let releaseAccount, intent;
  let failed = true;
  try {
    if (userId) {
      releaseAccount = await acquireAccountOperationLock(userId);
      if (!releaseAccount) throw Object.assign(new Error("ACCOUNT_BUSY"), { code: "ACCOUNT_BUSY" });
    }
    const registration = { kind: "copy", guestSessionId: context.guestSessionId ?? owner.guest_session_id,
      guestDocumentId: context.guestDocumentId ?? owner.document_id, userId, sourcePath: source,
      destinationPath: destination, temporaryPath: temporary, expiresAt: context.expiresAt ?? owner.expires_at };
    const canonical = (file) => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);
    const references = await query(`select storage_path from photos union select storage_path from guest_documents
      union select source_path from guest_document_claims where source_path is not null
      union select storage_path from guest_storage_retirements`);
    if (references.rows.some((row) => canonical(row.storage_path) === canonical(destination))) {
      throw Object.assign(new Error("REFERENCED_COPY_DESTINATION"), { code: "REFERENCED_COPY_DESTINATION" });
    }
    const previous = await query("select * from guest_file_intents");
    const sameOwner = (row) => String(row.guest_session_id) === String(registration.guestSessionId)
      && String(row.guest_document_id) === String(registration.guestDocumentId) && String(row.user_id) === String(userId)
      && row.source_path && canonical(row.source_path) === canonical(source);
    if (previous.rows.some((row) => [row.destination_path, row.temporary_path, row.source_path].filter(Boolean)
      .some((file) => canonical(file) === canonical(destination)) && !sameOwner(row))) {
      throw Object.assign(new Error("REFERENCED_COPY_DESTINATION"), { code: "REFERENCED_COPY_DESTINATION" });
    }
    const exists = await fs.stat(destination).then(() => true).catch((error) => { if (error.code !== "ENOENT") throw error; return false; });
    if (exists && !previous.rows.some((row) => sameOwner(row) && canonical(row.destination_path) === canonical(destination))) {
      throw Object.assign(new Error("UNOWNED_COPY_DESTINATION"), { code: "UNOWNED_COPY_DESTINATION" });
    }
    intent = await beginFileIntent(registration);
    await fs.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
    const file = await fs.open(temporary, "r+");
    try { await file.sync(); } finally { await file.close(); }
    await fs.rename(temporary, destination);
    // Persist the rename on Linux; Windows does not support directory fsync.
    if (process.platform !== "win32") {
      const directory = await fs.open(path.dirname(destination), "r");
      try { await directory.sync(); } finally { await directory.close(); }
    }
    failed = false;
  } finally {
    try {
      if (intent) {
        await fs.unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
        if (failed) await cancelFileIntent(intent.id);
      }
    } finally {
      if (intent) await intent.release();
      if (releaseAccount) await releaseAccount();
    }
  }
}
