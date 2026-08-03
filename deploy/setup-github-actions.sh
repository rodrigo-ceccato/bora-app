#!/bin/sh
# One-time trusted-admin bootstrap for GitHub Actions production deploys.
# It installs the root-owned DuckDNS credential helper and its narrow sudo rule.
set -eu

HOST="${BORA_HOST:-rocky@147.15.84.15}"

cd "$(dirname "$0")/.."

echo "==> copying GitHub Actions deployment helper to $HOST"
scp deploy/update-duckdns-env.sh deploy/bora-github-deploy.sudoers "$HOST:/tmp/"

echo "==> installing root-owned helper and sudo rule"
ssh "$HOST" '
  set -eu
  sudo install -o root -g root -m 755 /tmp/update-duckdns-env.sh /usr/local/sbin/bora-update-duckdns-env
  sudo install -o root -g root -m 440 /tmp/bora-github-deploy.sudoers /etc/sudoers.d/bora-github-deploy
  sudo visudo -cf /etc/sudoers.d/bora-github-deploy
  rm -f /tmp/update-duckdns-env.sh /tmp/bora-github-deploy.sudoers
'

echo '==> GitHub Actions bootstrap complete'
