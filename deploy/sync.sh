#!/bin/sh
# Sync this working tree to the remote VM and redeploy.
#
#   ./deploy/sync.sh            # sync, rebuild, restart
#   ./deploy/sync.sh --no-build # sync and restart without rebuilding images
#
# Override the target with BORA_HOST / BORA_REMOTE_DIR.
set -eu

HOST="${BORA_HOST:-rocky@147.15.84.15}"
DIR="${BORA_REMOTE_DIR:-/opt/bora}"
COMPOSE="docker compose -f compose.yaml -f compose.prod.yaml"

BUILD="--build"
if [ "${1:-}" = "--no-build" ]; then
  BUILD=""
fi

cd "$(dirname "$0")/.."

# Stamp the deployed revision so the VM can report what it is running.
revision=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  revision="${revision}-dirty"
fi
printf '%s\n' "$revision" > .deployed-revision

echo "==> syncing $revision to $HOST:$DIR"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'server/node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude 'deploy/duckdns.env' \
  --exclude 'android' \
  --exclude 'ios' \
  ./ "$HOST:$DIR/"

echo "==> deploying"
ssh "$HOST" "cd '$DIR' && $COMPOSE up -d $BUILD --remove-orphans && $COMPOSE ps"

echo "==> health"
ssh "$HOST" "curl -fsS http://127.0.0.1:8080/api/health && echo"

echo "==> deployed $revision"
