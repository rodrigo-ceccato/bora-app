#!/bin/sh
# Create an atomic, compressed PostgreSQL logical backup and retain 14 days.
set -eu

COMPOSE='docker compose -f /opt/bora/compose.yaml -f /opt/bora/compose.prod.yaml'
BACKUP_DIR=/var/backups/bora
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
tmp="$BACKUP_DIR/.bora-$timestamp.sql.gz.tmp"
backup="$BACKUP_DIR/bora-$timestamp.sql.gz"

install -d -m 700 "$BACKUP_DIR"
trap 'rm -f "$tmp"' EXIT HUP INT TERM

$COMPOSE exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -9 > "$tmp"
test -s "$tmp"
mv "$tmp" "$backup"
chmod 600 "$backup"
find "$BACKUP_DIR" -type f -name 'bora-*.sql.gz' -mtime +14 -delete
logger -t bora-backup "created $(basename "$backup")"
