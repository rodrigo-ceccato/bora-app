#!/bin/sh
# Verify the API, application shell, and one hashed JavaScript asset through an origin.
set -eu

origin=${1:?usage: smoke-release.sh ORIGIN}
label=${2:-$origin}
retries=${BORA_SMOKE_RETRIES:-10}
retry_delay=${BORA_SMOKE_RETRY_DELAY:-2}
max_time=${BORA_SMOKE_MAX_TIME:-20}
index=$(mktemp)
trap 'rm -f "$index"' EXIT HUP INT TERM

fetch() {
  curl --silent --show-error --fail \
    --retry "$retries" --retry-all-errors --retry-delay "$retry_delay" \
    --max-time "$max_time" "$@"
}

health=$(fetch "$origin/api/health")
printf '%s\n' "$health" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'

fetch --output "$index" "$origin/"
grep -Eqi '<div[^>]+id="root"' "$index"
asset_path=$(sed -n 's/.*<script[^>]*src="\([^"]*\/assets\/[^"]*\.js\)".*/\1/p' "$index" | head -n 1)
test -n "$asset_path"
case "$asset_path" in
  /*) ;;
  *) echo "$label returned an unsafe application asset path: $asset_path" >&2; exit 1 ;;
esac
fetch --output /dev/null "$origin$asset_path"

echo "$label smoke passed"
