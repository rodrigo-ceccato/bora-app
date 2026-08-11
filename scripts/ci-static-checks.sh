#!/bin/sh
# Reproducible CI linters and secret scan. Every tool image is versioned and
# digest-pinned; update the readable tag and digest together.
set -eu

CDPATH=''
export CDPATH
REPOSITORY=$(cd -- "$(dirname "$0")/.." && pwd)
ACTIONLINT_IMAGE='rhysd/actionlint:1.7.11@sha256:6f03470d0152251d7f07f7c4dc019dbe7024c72cd952f839544c7798843efa8f'
SHELLCHECK_IMAGE='koalaman/shellcheck-alpine:v0.11.0@sha256:9955be09ea7f0dbf7ae942ac1f2094355bb30d96fffba0ec09f5432207544002'
HADOLINT_IMAGE='hadolint/hadolint:v2.15.1-alpine@sha256:a1d49ae1a4e83c1dbad26b8c1ad7588c8bd1e04f4866b34ad3cac50335198552'
GITLEAKS_IMAGE='zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'

docker info >/dev/null

docker run --rm --volume "$REPOSITORY:/repo:ro" --workdir /repo \
  "$ACTIONLINT_IMAGE" -color

docker run --rm --volume "$REPOSITORY:/repo:ro" --workdir /repo --entrypoint /bin/sh \
  "$SHELLCHECK_IMAGE" -c \
  'find deploy scripts .githooks -type f \( -name "*.sh" -o -name "pre-push" \) -exec shellcheck --external-sources --exclude=SC1091,SC2016,SC2029,SC2034 {} +'

# nginx binds port 80 as root and then drops worker privileges; DL3002 would
# otherwise reject that standard official-image runtime arrangement.
docker run --rm --volume "$REPOSITORY:/repo:ro" --workdir /repo --entrypoint hadolint \
  "$HADOLINT_IMAGE" --ignore DL3002 Dockerfile.api Dockerfile.web

# Scan every committed patch. CI checks out full history before this gate. The
# read-only mount and redaction flag keep findings from exposing secret values.
docker run --rm --volume "$REPOSITORY:/repo:ro" --workdir /repo \
  "$GITLEAKS_IMAGE" git --redact --no-banner --no-color --verbose /repo

printf '%s\n' 'Action, shell, Dockerfile, and secret checks passed.'
