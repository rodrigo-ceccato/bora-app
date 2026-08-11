#!/bin/sh
# Atomically activate .env.next and roll back to the prior digest-pinned env on failure.
set -eu

tag=${1:?usage: activate-release.sh TAG SHA PORT DOMAIN}
sha=${2:?usage: activate-release.sh TAG SHA PORT DOMAIN}
port=${3:?usage: activate-release.sh TAG SHA PORT DOMAIN}
domain=${4:?usage: activate-release.sh TAG SHA PORT DOMAIN}
COMPOSE='docker compose -f compose.yaml -f compose.prod.yaml'

test -s .env.next
chmod 600 .env.next

had_previous=false
if [ -s .env ]; then
  cp -p .env .env.previous.next
  chmod 600 .env.previous.next
  mv .env.previous.next .env.previous
  had_previous=true
fi
if [ -s .deployed-release ]; then
  cp .deployed-release .deployed-release.previous.next
  mv .deployed-release.previous.next .deployed-release.previous
else
  rm -f .deployed-release.previous
fi

rollback() {
  echo '==> candidate failed; restoring previous production state' >&2
  if [ "$had_previous" = true ]; then
    if [ ! -s .release-assets.previous.tgz ]; then
      echo 'previous runtime-assets archive is missing' >&2
      return 1
    fi
    for required_asset in compose.yaml compose.prod.yaml deploy/activate-release.sh deploy/smoke-release.sh; do
      tar -tzf .release-assets.previous.tgz | grep -Fxq "$required_asset" || {
        echo "previous runtime-assets archive is missing $required_asset" >&2
        return 1
      }
    done
    cp -p .env.previous .env.rollback.next || return 1
    mv .env.rollback.next .env || return 1
    if [ -s .deployed-release.previous ]; then
      cp .deployed-release.previous .deployed-release.rollback.next || return 1
      mv .deployed-release.rollback.next .deployed-release || return 1
    else
      rm -f .deployed-release
    fi
    rollback_port=$(sed -n 's/^BORA_PORT=//p' .env.previous | tail -n 1)
    rollback_domain=$(sed -n 's/^BORA_DOMAIN=//p' .env.previous | tail -n 1)
    case "$rollback_port" in *[!0-9]*|'') echo 'previous env has an invalid BORA_PORT' >&2; return 1 ;; esac
    case "$rollback_domain" in *[!A-Za-z0-9.-]*|'') echo 'previous env has an invalid BORA_DOMAIN' >&2; return 1 ;; esac
    tar -xzf .release-assets.previous.tgz || return 1
    $COMPOSE up -d --no-build --force-recreate --remove-orphans || return 1
    BORA_SMOKE_RETRIES=5 ./deploy/smoke-release.sh "http://127.0.0.1:$rollback_port" 'rolled-back internal route' || return 1
    BORA_SMOKE_RETRIES=5 ./deploy/smoke-release.sh "https://$rollback_domain" 'rolled-back public route' || return 1
  else
    rm -f .env .deployed-release
    $COMPOSE down --remove-orphans || return 1
  fi
}

mv .env.next .env
printf '%s %s\n' "$tag" "$sha" > .deployed-release.next
mv .deployed-release.next .deployed-release

if ! $COMPOSE up -d --no-build --force-recreate --remove-orphans; then
  rollback || echo 'CRITICAL: automatic rollback also failed' >&2
  exit 1
fi

if ! BORA_SMOKE_RETRIES=10 ./deploy/smoke-release.sh "http://127.0.0.1:$port" 'candidate internal route' \
  || ! BORA_SMOKE_RETRIES=10 ./deploy/smoke-release.sh "https://$domain" 'candidate public route'; then
  rollback || echo 'CRITICAL: automatic rollback also failed' >&2
  exit 1
fi

echo "activated $tag ($sha)"
