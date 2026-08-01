#!/bin/sh
# Check the internal service and public TLS route. Failures are journaled.
set -eu

internal=http://127.0.0.1:8080/api/health
public=https://bora-app.duckdns.org/api/health

if ! curl -fsS --max-time 15 "$internal" | grep -Fq '"status":"ok"'; then
  logger -p user.err -t bora-healthcheck "internal health check failed: $internal"
  exit 1
fi
if ! curl -fsS --max-time 20 "$public" | grep -Fq '"status":"ok"'; then
  logger -p user.err -t bora-healthcheck "public health check failed: $public"
  exit 1
fi
logger -t bora-healthcheck 'health checks passed'
