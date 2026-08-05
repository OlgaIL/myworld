#!/usr/bin/env bash
set -euo pipefail

umask 077

APP_DIR="${APP_DIR:-/root/myworld}"
SERVER_DIR="${SERVER_DIR:-$APP_DIR/server}"
ENV_FILE="${ENV_FILE:-$SERVER_DIR/.env}"
UPLOADS_DIR="${UPLOADS_DIR:-$SERVER_DIR/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/root/myworld-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -d "$UPLOADS_DIR" ]]; then
  echo "Uploads directory not found: $UPLOADS_DIR" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed" >&2
  exit 1
fi

database_url="$(
  cd "$SERVER_DIR"
  DOTENV_CONFIG_PATH="$ENV_FILE" node --input-type=module -e \
    "import 'dotenv/config'; process.stdout.write(process.env.DATABASE_URL || '')"
)"

if [[ -z "$database_url" ]]; then
  echo "DATABASE_URL is not configured in $ENV_FILE" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not installed" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is not installed" >&2
  exit 1
fi

if [[ "$BACKUP_DIR" != /* || "$BACKUP_DIR" == "/" ]]; then
  echo "BACKUP_DIR must be an absolute safe path: $BACKUP_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date +'%Y-%m-%d_%H-%M-%S')"
db_backup="$BACKUP_DIR/myworld-db-$timestamp.dump"
uploads_backup="$BACKUP_DIR/myworld-uploads-$timestamp.tar.gz"
manifest="$BACKUP_DIR/myworld-backup-$timestamp.txt"
db_tmp="$db_backup.tmp"
uploads_tmp="$uploads_backup.tmp"
manifest_tmp="$manifest.tmp"

cleanup() {
  rm -f "$db_tmp" "$uploads_tmp" "$manifest_tmp"
}

trap cleanup EXIT

echo "Creating database backup: $db_backup"
pg_dump "$database_url" --format=custom --no-owner --no-acl --file="$db_tmp"
pg_restore --list "$db_tmp" >/dev/null

echo "Creating uploads backup: $uploads_backup"
tar -czf "$uploads_tmp" -C "$SERVER_DIR" uploads
tar -tzf "$uploads_tmp" >/dev/null

db_sha256="$(sha256sum "$db_tmp" | awk '{print $1}')"
uploads_sha256="$(sha256sum "$uploads_tmp" | awk '{print $1}')"

{
  echo "created_at=$timestamp"
  echo "app_dir=$APP_DIR"
  echo "env_file=$ENV_FILE"
  echo "db_backup=$db_backup"
  echo "db_sha256=$db_sha256"
  echo "uploads_backup=$uploads_backup"
  echo "uploads_sha256=$uploads_sha256"
  echo "retention_days=$RETENTION_DAYS"
} > "$manifest_tmp"

mv "$db_tmp" "$db_backup"
mv "$uploads_tmp" "$uploads_backup"
mv "$manifest_tmp" "$manifest"

find "$BACKUP_DIR" -type f -name 'myworld-*' -mtime "+$RETENTION_DAYS" -delete

echo "Backup complete:"
echo "$db_backup"
echo "$uploads_backup"
echo "$manifest"
