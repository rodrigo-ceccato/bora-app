#!/bin/sh
# Restore the latest complete backup into an isolated database and compare it
# with the exact source snapshot manifest, then remove the temporary database.
set -eu

APP_DIR=${BORA_APP_DIR:-/opt/bora}
COMPOSE="docker compose -f $APP_DIR/compose.yaml -f $APP_DIR/compose.prod.yaml"
BACKUP_DIR=${BORA_BACKUP_DIR:-/var/backups/bora}
VERIFY_SQL="$APP_DIR/deploy/verify-backup.sql"

install -d -m 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.bora-backup.lock"
flock -s 9

manifest=$(find "$BACKUP_DIR" -type f -name 'bora-*.manifest' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
test -n "$manifest"
test -s "$manifest"
test -s "$VERIFY_SQL"

manifest_value() {
  key=$1
  value=$(sed -n "s/^${key}=//p" "$manifest")
  test "$(printf '%s\n' "$value" | wc -l)" -eq 1
  printf '%s' "$value"
}

test "$(manifest_value format)" = 'bora-backup-manifest-v1'
dump_name=$(manifest_value dump)
case "$dump_name" in
  bora-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.sql.gz) ;;
  *) echo "Backup manifest contains an invalid dump name" >&2; exit 1 ;;
esac
backup="$BACKUP_DIR/$dump_name"
test "${manifest%.manifest}.sql.gz" = "$backup"
test -s "$backup"

expected_sha256=$(manifest_value sha256)
case "$expected_sha256" in
  *[!0-9a-f]*|'') echo "Backup manifest contains an invalid checksum" >&2; exit 1 ;;
esac
test "${#expected_sha256}" -eq 64
actual_sha256=$(sha256sum "$backup" | awk '{print $1}')
test "$actual_sha256" = "$expected_sha256"
gzip -t "$backup"

for count_key in migrations events votes recovery_tokens push_subscriptions push_notifications presence; do
  count_value=$(manifest_value "$count_key")
  case "$count_value" in
    ''|*[!0-9]*) echo "Backup manifest contains an invalid $count_key count" >&2; exit 1 ;;
  esac
done

verify_db="bora_restore_verify_$(date +%s)_$$"
restore_sql=$(mktemp "$BACKUP_DIR/.restore-verify.XXXXXX.sql")
chmod 600 "$restore_sql"

cleanup() {
  $COMPOSE exec -T database sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists '$verify_db'" || true
  rm -f -- "$restore_sql"
}
trap cleanup EXIT HUP INT TERM

# Decompress as a checked command before invoking psql. This avoids relying on
# non-portable pipefail semantics and prevents a producer failure being hidden.
gunzip -c "$backup" > "$restore_sql"
test -s "$restore_sql"
$COMPOSE exec -T database sh -c "createdb -U \"\$POSTGRES_USER\" '$verify_db'"
$COMPOSE exec -T database sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '$verify_db'" < "$restore_sql" >/dev/null
verification=$($COMPOSE exec -T database sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '$verify_db' -Atq" < "$VERIFY_SQL")
printf '%s\n' "$verification" | grep -Eq '^bora-backup-ok\|migrations=[0-9]+\|events=[0-9]+\|votes=[0-9]+\|recovery_tokens=[0-9]+\|push_subscriptions=[0-9]+\|push_notifications=[0-9]+\|presence=[0-9]+$'

verification_value() {
  key=$1
  printf '%s\n' "$verification" | tr '|' '\n' | sed -n "s/^${key}=//p"
}

for count_key in migrations events votes recovery_tokens push_subscriptions push_notifications presence; do
  expected=$(manifest_value "$count_key")
  actual=$(verification_value "$count_key")
  if [ "$actual" != "$expected" ]; then
    echo "Restored $count_key count $actual does not match source snapshot count $expected" >&2
    exit 1
  fi
done

logger -t bora-backup "verified checksum, schema, and source counts for $(basename "$backup")"
