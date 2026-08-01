#!/bin/sh
# Restore the latest dump to an isolated temporary database, then remove it.
set -eu

COMPOSE='docker compose -f /opt/bora/compose.yaml -f /opt/bora/compose.prod.yaml'
BACKUP_DIR=/var/backups/bora
backup=$(find "$BACKUP_DIR" -type f -name 'bora-*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
test -n "$backup"
test -s "$backup"
verify_db="bora_restore_verify_$(date +%s)"

cleanup() {
  $COMPOSE exec -T database sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists '$verify_db'" || true
}
trap cleanup EXIT HUP INT TERM

$COMPOSE exec -T database sh -c "createdb -U \"\$POSTGRES_USER\" '$verify_db'"
gunzip -c "$backup" | $COMPOSE exec -T database sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '$verify_db'" >/dev/null
$COMPOSE exec -T database sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '$verify_db' -Atc 'select count(*) from schema_migrations'" | grep -Eq '^[1-9][0-9]*$'
logger -t bora-backup "verified restore of $(basename "$backup")"
