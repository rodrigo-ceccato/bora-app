#!/bin/sh
# Create an atomic PostgreSQL backup and a source-count manifest.
set -eu

APP_DIR=${BORA_APP_DIR:-/opt/bora}
COMPOSE="docker compose -f $APP_DIR/compose.yaml -f $APP_DIR/compose.prod.yaml"
BACKUP_DIR=${BORA_BACKUP_DIR:-/var/backups/bora}
RETENTION_DAYS=${BORA_BACKUP_RETENTION_DAYS:-14}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$BACKUP_DIR/bora-$timestamp.sql.gz"
manifest="$BACKUP_DIR/bora-$timestamp.manifest"
work_dir=
snapshot_session_pid=
snapshot_input_open=false

case "$RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BORA_BACKUP_RETENTION_DAYS must be a non-negative integer" >&2; exit 1 ;;
esac

install -d -m 700 "$BACKUP_DIR"

# Backup, verification, and retention share this lock. A manifest is the final
# completion marker, so a verifier can never select a half-published pair.
exec 9>"$BACKUP_DIR/.bora-backup.lock"
flock -x 9

work_dir=$(mktemp -d "$BACKUP_DIR/.backup-work.XXXXXX")
dump="$work_dir/backup.sql"
compressed="$work_dir/backup.sql.gz"
manifest_tmp="$work_dir/backup.manifest"
snapshot_input="$work_dir/snapshot-input"
snapshot_output="$work_dir/snapshot-output"
snapshot_error="$work_dir/snapshot-error"
mkfifo "$snapshot_input"

cleanup() {
  if [ "$snapshot_input_open" = true ]; then
    printf '%s\n' 'rollback;' '\q' >&3 2>/dev/null || true
    exec 3>&-
    snapshot_input_open=false
  fi
  if [ -n "$snapshot_session_pid" ]; then
    kill "$snapshot_session_pid" 2>/dev/null || true
    wait "$snapshot_session_pid" 2>/dev/null || true
  fi
  if [ -n "$work_dir" ] && [ -d "$work_dir" ]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT HUP INT TERM

# Keep an exporting REPEATABLE READ transaction open while pg_dump runs. Both
# these counts and pg_dump therefore see the exact same database snapshot even
# while normal application writes continue in later snapshots.
$COMPOSE exec -T database sh -c \
  'exec psql -X -Atq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$snapshot_input" > "$snapshot_output" 2> "$snapshot_error" &
snapshot_session_pid=$!
exec 3>"$snapshot_input"
snapshot_input_open=true
printf '%s\n' \
  'begin transaction isolation level repeatable read read only;' \
  "select 'BORA_SNAPSHOT|' || pg_export_snapshot();" \
  "select 'BORA_COUNTS|migrations=' || (select count(*) from schema_migrations) || '|events=' || (select count(*) from events) || '|votes=' || (select count(*) from votes) || '|recovery_tokens=' || (select count(*) from participant_recovery_tokens) || '|push_subscriptions=' || (select count(*) from push_subscriptions) || '|push_notifications=' || (select count(*) from push_notifications) || '|presence=' || (select count(*) from participant_presence);" \
  '\echo BORA_READY' >&3

ready=false
attempt=0
while [ "$attempt" -lt 100 ]; do
  if grep -q '^BORA_READY$' "$snapshot_output" 2>/dev/null; then
    ready=true
    break
  fi
  if ! kill -0 "$snapshot_session_pid" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done
if [ "$ready" != true ]; then
  echo "Could not export a PostgreSQL backup snapshot" >&2
  test ! -s "$snapshot_error" || cat "$snapshot_error" >&2
  exit 1
fi

snapshot=$(sed -n 's/^BORA_SNAPSHOT|//p' "$snapshot_output")
counts=$(sed -n 's/^BORA_COUNTS|//p' "$snapshot_output")
case "$snapshot" in
  ''|*[!0-9A-Fa-f-]*) echo "PostgreSQL returned an invalid exported snapshot" >&2; exit 1 ;;
esac
printf '%s\n' "$counts" | grep -Eq '^migrations=[0-9]+\|events=[0-9]+\|votes=[0-9]+\|recovery_tokens=[0-9]+\|push_subscriptions=[0-9]+\|push_notifications=[0-9]+\|presence=[0-9]+$'

# Keep pg_dump and gzip as separate checked commands. POSIX sh has no portable
# pipefail, so a direct producer pipeline could otherwise publish truncation.
$COMPOSE exec -T database sh -c \
  'exec pg_dump --no-owner --no-privileges --snapshot="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  bora-pg-dump "$snapshot" > "$dump"
test -s "$dump"

printf '%s\n' 'rollback;' '\q' >&3
exec 3>&-
snapshot_input_open=false
wait "$snapshot_session_pid"
snapshot_session_pid=

gzip -9 -c "$dump" > "$compressed"
test -s "$compressed"
gzip -t "$compressed"
sha256=$(sha256sum "$compressed" | awk '{print $1}')
case "$sha256" in
  *[!0-9a-f]*|'') echo "Could not calculate the backup checksum" >&2; exit 1 ;;
esac

{
  printf '%s\n' 'format=bora-backup-manifest-v1'
  printf 'dump=%s\n' "$(basename "$backup")"
  printf 'sha256=%s\n' "$sha256"
  printf 'snapshot=%s\n' "$snapshot"
  printf '%s\n' "$counts" | tr '|' '\n'
} > "$manifest_tmp"
chmod 600 "$compressed" "$manifest_tmp"
test ! -e "$backup"
test ! -e "$manifest"

# Publish the data first and the manifest last. Verification discovers only
# manifests, so interruption between these renames leaves an ignored orphan.
mv "$compressed" "$backup"
mv "$manifest_tmp" "$manifest"

# Retire complete pairs. Removing the completion marker first prevents a new
# verifier from selecting a dump that retention is about to remove.
find "$BACKUP_DIR" -type f -name 'bora-*.manifest' -mtime +"$RETENTION_DAYS" -print |
while IFS= read -r old_manifest; do
  old_backup=${old_manifest%.manifest}.sql.gz
  rm -f -- "$old_manifest" "$old_backup"
done
# Clean up interrupted, manifest-less dumps one day after the normal horizon.
orphan_days=$((RETENTION_DAYS + 1))
find "$BACKUP_DIR" -type f -name 'bora-*.sql.gz' -mtime +"$orphan_days" -print |
while IFS= read -r old_backup; do
  old_manifest=${old_backup%.sql.gz}.manifest
  [ -e "$old_manifest" ] || rm -f -- "$old_backup"
done

logger -t bora-backup "created $(basename "$backup") with source-count manifest"
