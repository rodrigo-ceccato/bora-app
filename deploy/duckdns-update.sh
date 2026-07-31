#!/bin/sh
# Point a DuckDNS subdomain at this machine's current public IP.
# Reads DUCKDNS_DOMAIN and DUCKDNS_TOKEN from /etc/duckdns.env.
set -eu

. /etc/duckdns.env

response=$(curl -fsS --max-time 20 \
  "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")

if [ "$response" != "OK" ]; then
  echo "duckdns update failed: ${response}" >&2
  exit 1
fi

echo "duckdns update OK for ${DUCKDNS_DOMAIN}"
