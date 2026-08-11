#!/bin/sh
# Deploy a GitHub Release image pair to the production VM.
#
# Required environment:
#   BORA_HOST, BORA_REMOTE_DIR, BORA_API_IMAGE, BORA_WEB_IMAGE,
#   BORA_RELEASE_TAG, BORA_RELEASE_SHA, POSTGRES_PASSWORD, DUCKDNS_TOKEN
# Plus the non-secret Compose settings documented in docs/operations.md.
set -eu

HOST="${BORA_HOST:?set BORA_HOST}"
DIR="${BORA_REMOTE_DIR:?set BORA_REMOTE_DIR}"
COMPOSE='docker compose -f compose.yaml -f compose.prod.yaml'

required_vars='BORA_API_IMAGE BORA_WEB_IMAGE BORA_RELEASE_TAG BORA_RELEASE_SHA POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD BORA_PORT BORA_BIND BORA_DOMAIN BORA_TLS_EMAIL DUCKDNS_DOMAIN DUCKDNS_TOKEN BORA_VAPID_PUBLIC_KEY BORA_VAPID_PRIVATE_KEY BORA_VAPID_SUBJECT BORA_TRUST_PROXY_HOPS'
for name in $required_vars; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || { echo "missing $name" >&2; exit 1; }
done

printf '%s\n' "$BORA_RELEASE_TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || {
  echo 'BORA_RELEASE_TAG must be a stable vX.Y.Z tag' >&2
  exit 1
}
case "$BORA_API_IMAGE" in *@sha256:*) ;; *) echo 'BORA_API_IMAGE must be digest-pinned' >&2; exit 1 ;; esac
case "$BORA_WEB_IMAGE" in *@sha256:*) ;; *) echo 'BORA_WEB_IMAGE must be digest-pinned' >&2; exit 1 ;; esac
case "$BORA_RELEASE_SHA" in *[!0-9a-f]*|'') echo 'BORA_RELEASE_SHA must be a lowercase hexadecimal commit id' >&2; exit 1 ;; esac
case "$BORA_PORT" in *[!0-9]*|'') echo 'BORA_PORT must be numeric' >&2; exit 1 ;; esac
case "$BORA_DOMAIN" in *[!A-Za-z0-9.-]*|'') echo 'BORA_DOMAIN must be a hostname' >&2; exit 1 ;; esac
[ "$BORA_BIND" = '127.0.0.1' ] || { echo 'BORA_BIND must be 127.0.0.1 for the two-proxy production topology' >&2; exit 1; }
[ "$BORA_TRUST_PROXY_HOPS" = '2' ] || { echo 'BORA_TRUST_PROXY_HOPS must be 2 for Caddy -> nginx -> API' >&2; exit 1; }

cd "$(dirname "$0")/.."
runtime_env=$(mktemp)
release_complete=false
assets_snapshot=false
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  rm -f "$runtime_env"
  if [ "$assets_snapshot" = true ] && [ "$release_complete" != true ]; then
    echo '==> release interrupted; restoring the prior runtime assets' >&2
    ssh "$HOST" "cd '$DIR' && if [ -s .release-assets.previous.tgz ]; then tar -xzf .release-assets.previous.tgz; fi" || \
      echo 'CRITICAL: could not restore prior runtime assets' >&2
  fi
  exit "$status"
}
trap cleanup EXIT HUP INT TERM
umask 077
cat > "$runtime_env" <<EOF
POSTGRES_DB=$POSTGRES_DB
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
BORA_PORT=$BORA_PORT
BORA_BIND=$BORA_BIND
BORA_DOMAIN=$BORA_DOMAIN
BORA_TLS_EMAIL=$BORA_TLS_EMAIL
BORA_API_IMAGE=$BORA_API_IMAGE
BORA_WEB_IMAGE=$BORA_WEB_IMAGE
BORA_VAPID_PUBLIC_KEY=$BORA_VAPID_PUBLIC_KEY
BORA_VAPID_PRIVATE_KEY=$BORA_VAPID_PRIVATE_KEY
BORA_VAPID_SUBJECT=$BORA_VAPID_SUBJECT
BORA_TRUST_PROXY_HOPS=$BORA_TRUST_PROXY_HOPS
EOF

# rsync --delete replaces the live Compose/deploy files before activation. Save
# their exact deployed versions first, so failures during sync, pull, startup,
# or smoke checks can restore more than just the prior image/environment values.
echo '==> snapshotting previous runtime assets'
ssh "$HOST" "cd '$DIR' && if [ -s .env ]; then umask 077; tar --exclude='deploy/duckdns.env' --exclude='deploy/*.secret' -czf .release-assets.previous.tgz.next compose.yaml compose.prod.yaml deploy && mv .release-assets.previous.tgz.next .release-assets.previous.tgz; else rm -f .release-assets.previous.tgz .release-assets.previous.tgz.next; fi"
assets_snapshot=true

echo "==> syncing release $BORA_RELEASE_TAG to $HOST:$DIR"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'server/node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.next' \
  --exclude '.env.previous' \
  --exclude '.deployed-revision' \
  --exclude '.deployed-release' \
  --exclude '.deployed-release.previous' \
  --exclude '.release-assets.previous.tgz' \
  --exclude '.release-assets.previous.tgz.next' \
  --exclude 'deploy/duckdns.env' \
  --exclude 'deploy/*.secret' \
  --exclude 'android' \
  --exclude 'ios' \
  ./ "$HOST:$DIR/"

echo '==> syncing DuckDNS credentials'
printf 'DUCKDNS_DOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$DUCKDNS_DOMAIN" "$DUCKDNS_TOKEN" |
  ssh "$HOST" 'sudo -n /usr/local/sbin/bora-update-duckdns-env'

# Stage the candidate env without replacing the boot-time .env. Pulling with an
# explicit env file also supports a clean first deployment and cannot alter the
# running services when the registry is unavailable.
scp "$runtime_env" "$HOST:$DIR/.env.next"
echo '==> pulling release images'
ssh "$HOST" "cd '$DIR' && chmod 600 .env.next && docker compose --env-file .env.next -f compose.yaml -f compose.prod.yaml pull api web"

echo '==> updating runtime configuration and restarting'
ssh "$HOST" "cd '$DIR' && ./deploy/activate-release.sh '$BORA_RELEASE_TAG' '$BORA_RELEASE_SHA' '$BORA_PORT' '$BORA_DOMAIN'"
release_complete=true
ssh "$HOST" "cd '$DIR' && $COMPOSE ps"

echo "==> deployed $BORA_RELEASE_TAG"
