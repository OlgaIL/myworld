#!/usr/bin/env bash
set -euo pipefail

umask 077

EXPECTED_DATABASE_NAME="word2you_restore_test"
RESTORE_ENV_FILE="${RESTORE_ENV_FILE:-/root/word2you-restore.env}"
BACKUP_DIR="${BACKUP_DIR:-/root/myworld-backups}"
RESTORE_ROOT="${RESTORE_ROOT:-/root/myworld-restore-test}"
BACKUP_STAMP="${1:-}"

fail() {
  echo "Restore rehearsal stopped: $*" >&2
  exit 1
}

if [[ -z "$BACKUP_STAMP" || ! "$BACKUP_STAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]]; then
  fail "pass backup timestamp as the first argument: YYYY-MM-DD_HH-MM-SS"
fi

[[ -f "$RESTORE_ENV_FILE" ]] || fail "restore env file not found: $RESTORE_ENV_FILE"
[[ -d "$BACKUP_DIR" ]] || fail "backup directory not found: $BACKUP_DIR"

if [[ "$RESTORE_ROOT" != /* || "$RESTORE_ROOT" == "/" || "$RESTORE_ROOT" == "/root/myworld" || "$RESTORE_ROOT" == "/root/myworld/server/uploads" ]]; then
  fail "unsafe RESTORE_ROOT: $RESTORE_ROOT"
fi

for command_name in node pg_restore psql tar sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is not installed"
done

restore_database_url="$(
  RESTORE_ENV_FILE="$RESTORE_ENV_FILE" node --input-type=module -e '
    import fs from "node:fs";

    const content = fs.readFileSync(process.env.RESTORE_ENV_FILE, "utf8");
    const line = content.split(/\r?\n/).find((item) => item.trim().startsWith("RESTORE_DATABASE_URL="));
    if (!line) process.exit(2);
    process.stdout.write(line.slice(line.indexOf("=") + 1).trim().replace(/^(["\x27])(.*)\1$/, "$2"));
  '
)" || fail "RESTORE_DATABASE_URL is not configured in $RESTORE_ENV_FILE"

[[ -n "$restore_database_url" ]] || fail "RESTORE_DATABASE_URL is empty"

url_database_name="$(
  RESTORE_DATABASE_URL="$restore_database_url" node --input-type=module -e '
    const value = new URL(process.env.RESTORE_DATABASE_URL);
    process.stdout.write(decodeURIComponent(value.pathname.replace(/^\//, "")));
  '
)" || fail "RESTORE_DATABASE_URL is invalid"

[[ "$url_database_name" == "$EXPECTED_DATABASE_NAME" ]] || fail "database in URL must be exactly $EXPECTED_DATABASE_NAME, got: $url_database_name"

actual_database_name="$(psql "$restore_database_url" -X -A -t -v ON_ERROR_STOP=1 -c "select current_database()")"
[[ "$actual_database_name" == "$EXPECTED_DATABASE_NAME" ]] || fail "connected database must be exactly $EXPECTED_DATABASE_NAME, got: $actual_database_name"

existing_tables="$(psql "$restore_database_url" -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema = 'public'")"
[[ "$existing_tables" == "0" ]] || fail "test database is not empty ($existing_tables public tables); create a new empty database"

db_backup="$BACKUP_DIR/myworld-db-$BACKUP_STAMP.dump"
uploads_backup="$BACKUP_DIR/myworld-uploads-$BACKUP_STAMP.tar.gz"
manifest="$BACKUP_DIR/myworld-backup-$BACKUP_STAMP.txt"

[[ -f "$db_backup" ]] || fail "database backup not found: $db_backup"
[[ -f "$uploads_backup" ]] || fail "uploads backup not found: $uploads_backup"
[[ -f "$manifest" ]] || fail "manifest not found: $manifest"

expected_db_sha256="$(awk -F= '$1 == "db_sha256" { print $2 }' "$manifest")"
expected_uploads_sha256="$(awk -F= '$1 == "uploads_sha256" { print $2 }' "$manifest")"
[[ "$expected_db_sha256" =~ ^[a-fA-F0-9]{64}$ ]] || fail "invalid database checksum in manifest"
[[ "$expected_uploads_sha256" =~ ^[a-fA-F0-9]{64}$ ]] || fail "invalid uploads checksum in manifest"

actual_db_sha256="$(sha256sum "$db_backup" | awk '{print $1}')"
actual_uploads_sha256="$(sha256sum "$uploads_backup" | awk '{print $1}')"
[[ "$actual_db_sha256" == "$expected_db_sha256" ]] || fail "database checksum mismatch"
[[ "$actual_uploads_sha256" == "$expected_uploads_sha256" ]] || fail "uploads checksum mismatch"

pg_restore --list "$db_backup" >/dev/null
tar -tzf "$uploads_backup" >/dev/null

restore_dir="$RESTORE_ROOT/$BACKUP_STAMP"
[[ ! -e "$restore_dir" ]] || fail "restore directory already exists: $restore_dir"
mkdir -p "$restore_dir"

echo "Safety check passed. Restoring only to database: $actual_database_name"
echo "Restoring database backup: $db_backup"
pg_restore --exit-on-error --no-owner --no-acl --dbname "$restore_database_url" "$db_backup"

echo "Extracting uploads only to: $restore_dir"
tar -xzf "$uploads_backup" -C "$restore_dir"
[[ -d "$restore_dir/uploads" ]] || fail "uploads directory is missing after extraction"

report="$restore_dir/restore-report.txt"

table_count() {
  local table_name="$1"
  psql "$restore_database_url" -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from $table_name"
}

users_count="$(table_count users)"
photos_count="$(table_count photos)"
guest_documents_count="$(table_count guest_documents)"
payments_count="$(table_count payments)"
credit_events_count="$(table_count processing_credit_events)"
uploads_count="$(find "$restore_dir/uploads" -maxdepth 1 -type f | wc -l | tr -d ' ')"

missing_photo_files=0
while IFS= read -r filename; do
  [[ -z "$filename" ]] && continue
  if [[ ! -f "$restore_dir/uploads/$filename" ]]; then
    echo "Missing photo file: $filename" >> "$report"
    missing_photo_files=$((missing_photo_files + 1))
  fi
done < <(psql "$restore_database_url" -X -A -t -v ON_ERROR_STOP=1 -c "select filename from photos order by id")

{
  echo "backup_stamp=$BACKUP_STAMP"
  echo "database=$actual_database_name"
  echo "restore_dir=$restore_dir"
  echo "users=$users_count"
  echo "photos=$photos_count"
  echo "guest_documents=$guest_documents_count"
  echo "payments=$payments_count"
  echo "processing_credit_events=$credit_events_count"
  echo "upload_files=$uploads_count"
  echo "missing_photo_files=$missing_photo_files"
} >> "$report"

cat "$report"

if [[ "$missing_photo_files" != "0" ]]; then
  fail "$missing_photo_files stored photo files are missing; see $report"
fi

echo "Restore rehearsal completed successfully. Production database and uploads were not changed."
