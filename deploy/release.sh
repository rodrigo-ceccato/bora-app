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

required_vars='BORA_API_IMAGE BORA_WEB_IMAGE BORA_RELEASE_TAG BORA_RELEASE_SHA POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD BORA_PORT BORA_BIND BORA_DOMAIN BORA_TLS_EMAIL DUCKDNS_DOMAIN DUCKDNS_TOKEN BORA_VAPID_PUBLIC_KEY BORA_VAPID_PRIVATE_KEY BORA_VAPID_SUBJECT'
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

cd "$(dirname "$0")/.."
runtime_env=$(mktemp)
trap 'rm -f "$runtime_env"' EXIT HUP INT TERM
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
EOF

echo "==> syncing release $BORA_RELEASE_TAG to $HOST:$DIR"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'server/node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '.deployed-revision' \
  --exclude '.deployed-release' \
  --exclude 'deploy/duckdns.env' \
  --exclude 'android' \
  --exclude 'ios' \
  ./ "$HOST:$DIR/"

echo '==> syncing DuckDNS credentials'
printf 'DUCKDNS_DOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$DUCKDNS_DOMAIN" "$DUCKDNS_TOKEN" |
  ssh "$HOST" 'sudo -n /usr/local/sbin/bora-update-duckdns-env'

# Pull the candidate images before replacing the boot-time .env. A transient
# registry failure therefore cannot leave the VM configured for an unavailable image.
echo '==> pulling release images'
ssh "$HOST" "cd '$DIR' && BORA_API_IMAGE='$BORA_API_IMAGE' BORA_WEB_IMAGE='$BORA_WEB_IMAGE' $COMPOSE pull api web"

echo '==> updating runtime configuration and restarting'
scp "$runtime_env" "$HOST:$DIR/.env.next"
ssh "$HOST" "cd '$DIR' && chmod 600 .env.next && mv .env.next .env && printf '%s %s\\n' '$BORA_RELEASE_TAG' '$BORA_RELEASE_SHA' > .deployed-release && $COMPOSE up -d --no-build --force-recreate --remove-orphans && $COMPOSE ps"

echo '==> health checks'
ssh "$HOST" "curl --retry 10 --retry-all-errors --retry-delay 2 --fail http://127.0.0.1:8080/api/health && echo && curl --retry 10 --retry-all-errors --retry-delay 2 --fail https://$BORA_DOMAIN/api/health && echo"

echo "==> deployed $BORA_RELEASE_TAG"
