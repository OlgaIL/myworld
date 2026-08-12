#!/usr/bin/env bash
set -euo pipefail

umask 077

EXPECTED_DATABASE_NAME="word2you_restore_test"
APP_DIR="${APP_DIR:-/root/myworld}"
RESTORE_ENV_FILE="${RESTORE_ENV_FILE:-/root/word2you-restore.env}"
RESTORE_ROOT="${RESTORE_ROOT:-/root/myworld-restore-test}"
TEST_PORT="${TEST_PORT:-4100}"
BACKUP_STAMP="${1:-}"

fail() {
  echo "Restored server verification stopped: $*" >&2
  exit 1
}

if [[ -z "$BACKUP_STAMP" || ! "$BACKUP_STAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]]; then
  fail "pass backup timestamp as the first argument: YYYY-MM-DD_HH-MM-SS"
fi

[[ "$TEST_PORT" =~ ^[0-9]+$ ]] || fail "TEST_PORT must be numeric"
[[ "$TEST_PORT" != "4000" ]] || fail "port 4000 is reserved for production"
[[ -f "$RESTORE_ENV_FILE" ]] || fail "restore env file not found: $RESTORE_ENV_FILE"
[[ -d "$APP_DIR/server/node_modules" ]] || fail "production server dependencies not found"

for command_name in node psql tar curl sed; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is not installed"
done

restore_dir="$RESTORE_ROOT/$BACKUP_STAMP"
restored_uploads="$restore_dir/uploads"
test_app_dir="$restore_dir/app-check"
[[ -d "$restored_uploads" ]] || fail "restored uploads not found: $restored_uploads"
[[ ! -e "$test_app_dir" ]] || fail "test app directory already exists: $test_app_dir"

restore_database_url="$(
  RESTORE_ENV_FILE="$RESTORE_ENV_FILE" node --input-type=module -e '
    import fs from "node:fs";
    const content = fs.readFileSync(process.env.RESTORE_ENV_FILE, "utf8");
    const line = content.split(/\r?\n/).find((item) => item.trim().startsWith("RESTORE_DATABASE_URL="));
    if (!line) process.exit(2);
    process.stdout.write(line.slice(line.indexOf("=") + 1).trim().replace(/^(["\x27])(.*)\1$/, "$2"));
  '
)" || fail "RESTORE_DATABASE_URL is not configured"

actual_database_name="$(psql "$restore_database_url" -X -A -t -v ON_ERROR_STOP=1 -c "select current_database()")"
[[ "$actual_database_name" == "$EXPECTED_DATABASE_NAME" ]] || fail "connected database must be exactly $EXPECTED_DATABASE_NAME, got: $actual_database_name"

if command -v ss >/dev/null 2>&1 && ss -lnt | awk '{print $4}' | grep -Eq "(^|:)$TEST_PORT$"; then
  fail "test port $TEST_PORT is already in use"
fi

mkdir -p "$test_app_dir/server" "$test_app_dir/client"

tar -cf - \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./node_modules' \
  --exclude='./uploads' \
  -C "$APP_DIR/server" . | tar -xf - -C "$test_app_dir/server"

if [[ -d "$APP_DIR/client/dist" ]]; then
  cp -a "$APP_DIR/client/dist" "$test_app_dir/client/dist"
else
  mkdir -p "$test_app_dir/client/dist"
  printf '<!doctype html><title>Restore check</title><p>Restore check</p>\n' > "$test_app_dir/client/dist/index.html"
fi

ln -s "$APP_DIR/server/node_modules" "$test_app_dir/server/node_modules"
ln -s "$restored_uploads" "$test_app_dir/server/uploads"

database_ssl="$(sed -n 's/^DATABASE_SSL=//p' "$APP_DIR/server/.env" | tail -n 1)"
database_ssl_ca_path="$(sed -n 's/^DATABASE_SSL_CA_PATH=//p' "$APP_DIR/server/.env" | tail -n 1)"

{
  printf 'DATABASE_URL=%s\n' "$restore_database_url"
  printf 'DATABASE_SSL=%s\n' "${database_ssl:-false}"
  [[ -n "$database_ssl_ca_path" ]] && printf 'DATABASE_SSL_CA_PATH=%s\n' "$database_ssl_ca_path"
  printf 'CLIENT_URL=http://127.0.0.1:%s\n' "$TEST_PORT"
  printf 'SERVER_URL=http://127.0.0.1:%s\n' "$TEST_PORT"
  printf 'SESSION_SECRET=restore-rehearsal-only\n'
  printf 'AUTH_PROVIDERS=none\n'
  printf 'GOOGLE_AUTH_ENABLED=false\n'
  printf 'YANDEX_AUTH_ENABLED=false\n'
  printf 'VK_AUTH_ENABLED=false\n'
  printf 'SBER_AUTH_ENABLED=false\n'
  printf 'MTS_AUTH_ENABLED=false\n'
  printf 'PROCESSING_ENABLED=false\n'
  printf 'GOOGLE_OCR_ENABLED=false\n'
  printf 'YANDEX_OCR_ENABLED=false\n'
  printf 'YANDEX_AI_ENABLED=false\n'
  printf 'OPENAI_ENABLED=false\n'
  printf 'ADMIN_ENABLED=false\n'
  printf 'YOOKASSA_ENABLED=false\n'
  printf 'YOOKASSA_MOCK_SUCCESS=false\n'
} > "$test_app_dir/server/.env"

TEST_SERVER_FILE="$test_app_dir/server/server.js" TEST_PORT="$TEST_PORT" node --input-type=module -e '
  import fs from "node:fs";
  const filename = process.env.TEST_SERVER_FILE;
  const source = fs.readFileSync(filename, "utf8");
  const original = "app.listen(4000, () => console.log(\"Server running on http://localhost:4000\"));";
  const replacement = `app.listen(${process.env.TEST_PORT}, "127.0.0.1", () => console.log("Restore check server running"));`;
  if (!source.includes(original)) process.exit(2);
  fs.writeFileSync(filename, source.replace(original, replacement));
' || fail "could not isolate test server port"

grep -q "app.listen($TEST_PORT, \"127.0.0.1\"" "$test_app_dir/server/server.js" || fail "could not isolate test server port"

server_log="$restore_dir/restore-server-check.log"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT

previous_dir="$PWD"
cd "$test_app_dir/server"
node server.js > "$server_log" 2>&1 &
server_pid=$!
cd "$previous_dir"

health_response=""
for _ in {1..20}; do
  if health_response="$(curl --silent --show-error --fail "http://127.0.0.1:$TEST_PORT/api/health" 2>/dev/null)"; then
    break
  fi

  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$server_log" >&2
    fail "test server stopped before health check"
  fi

  sleep 1
done

[[ -n "$health_response" ]] || {
  cat "$server_log" >&2
  fail "test server did not answer on port $TEST_PORT"
}

HEALTH_RESPONSE="$health_response" node --input-type=module -e '
  const health = JSON.parse(process.env.HEALTH_RESPONSE);
  if (health.status !== "ok" || health.database?.connected !== true) process.exit(1);
  if (health.processing?.enabled !== false) process.exit(2);
  console.log(`health=${health.status}`);
  console.log(`database_connected=${health.database.connected}`);
  console.log(`processing_enabled=${health.processing.enabled}`);
' || fail "health response did not pass safety checks"

curl --silent --show-error --fail "http://127.0.0.1:$TEST_PORT/" >/dev/null || fail "client entry page is not served"

echo "client_entry=ok"
echo "test_port=$TEST_PORT"
echo "server_log=$server_log"
echo "Restored server verification completed successfully. The temporary server will now stop."
