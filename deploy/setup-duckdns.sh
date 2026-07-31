#!/bin/sh
# Install the DuckDNS credentials from deploy/duckdns.env onto the VM, enable
# the refresh timer, and force one update.
#
# The token is written to /etc/duckdns.env (mode 600, root-owned) and is never
# copied into /opt/bora.
set -eu

HOST="${BORA_HOST:-rocky@147.15.84.15}"

cd "$(dirname "$0")/.."
ENV_FILE="deploy/duckdns.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE - copy deploy/duckdns.env.example and fill it in" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "./$ENV_FILE"

if [ -z "${DUCKDNS_DOMAIN:-}" ] || [ -z "${DUCKDNS_TOKEN:-}" ]; then
  echo "$ENV_FILE must set DUCKDNS_DOMAIN and DUCKDNS_TOKEN" >&2
  exit 1
fi

case "$DUCKDNS_DOMAIN" in
  *.*) echo "DUCKDNS_DOMAIN must be the bare label (e.g. bora-app), not a full hostname" >&2; exit 1 ;;
esac

echo "==> installing credentials for ${DUCKDNS_DOMAIN}.duckdns.org on $HOST"
# Piped over stdin so the token never appears in the remote command line,
# where it would be visible in the process list.
printf 'DUCKDNS_DOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$DUCKDNS_DOMAIN" "$DUCKDNS_TOKEN" |
  ssh "$HOST" 'sudo install -m 600 /dev/stdin /etc/duckdns.env'

echo "==> enabling the refresh timer"
ssh "$HOST" '
  sudo install -m 755 /opt/bora/deploy/duckdns-update.sh /usr/local/bin/duckdns-update.sh
  sudo install -m 644 /opt/bora/deploy/duckdns.service /etc/systemd/system/duckdns.service
  sudo install -m 644 /opt/bora/deploy/duckdns.timer /etc/systemd/system/duckdns.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now duckdns.timer
  sudo systemctl start duckdns.service
  sudo journalctl -u duckdns.service -n 5 --no-pager
'

echo "==> current record"
dig +short "${DUCKDNS_DOMAIN}.duckdns.org" || true
