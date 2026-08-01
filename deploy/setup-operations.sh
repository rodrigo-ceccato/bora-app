#!/bin/sh
# Install Bora backup and health-check systemd units on the configured VM.
set -eu

HOST="${BORA_HOST:-rocky@147.15.84.15}"

echo "==> installing Bora operations units on $HOST"
ssh "$HOST" '
  set -eu
  sudo install -m 755 /opt/bora/deploy/bora-backup.sh /usr/local/bin/bora-backup.sh
  sudo install -m 755 /opt/bora/deploy/bora-backup-verify.sh /usr/local/bin/bora-backup-verify.sh
  sudo install -m 755 /opt/bora/deploy/bora-healthcheck.sh /usr/local/bin/bora-healthcheck.sh
  sudo install -m 644 /opt/bora/deploy/bora-backup.service /etc/systemd/system/
  sudo install -m 644 /opt/bora/deploy/bora-backup.timer /etc/systemd/system/
  sudo install -m 644 /opt/bora/deploy/bora-backup-verify.service /etc/systemd/system/
  sudo install -m 644 /opt/bora/deploy/bora-backup-verify.timer /etc/systemd/system/
  sudo install -m 644 /opt/bora/deploy/bora-healthcheck.service /etc/systemd/system/
  sudo install -m 644 /opt/bora/deploy/bora-healthcheck.timer /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now bora-backup.timer bora-backup-verify.timer bora-healthcheck.timer
  sudo systemctl start bora-backup.service
  sudo systemctl start bora-backup-verify.service
  sudo systemctl start bora-healthcheck.service
  sudo systemctl --no-pager --full status bora-backup.service bora-backup-verify.service bora-healthcheck.service
  sudo systemctl list-timers bora-backup.timer bora-backup-verify.timer bora-healthcheck.timer --no-pager
'
