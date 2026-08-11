#!/bin/sh
# Generate SBOMs and fail on fixable HIGH/CRITICAL vulnerabilities in the two
# locally built release images. No registry credentials are passed to tools.
set -eu

CDPATH=''
export CDPATH
REPOSITORY=$(cd -- "$(dirname "$0")/.." && pwd)
OUTPUT_DIR=${BORA_SBOM_DIR:-$REPOSITORY/.artifacts/sbom}
API_IMAGE=${BORA_SCAN_API_IMAGE:-bora-api:local}
WEB_IMAGE=${BORA_SCAN_WEB_IMAGE:-bora-web:local}
SYFT_IMAGE='anchore/syft:v1.50.0@sha256:1288ea4c8b38767b4e620c1e312c8cb26b6e887a99b4f07ab6cd19fc6f225026'
TRIVY_IMAGE='aquasec/trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c'
work_dir=$(mktemp -d)
mkdir "$work_dir/syft-tmp"

cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT HUP INT TERM

docker info >/dev/null
install -d "$OUTPUT_DIR"
docker volume create bora-trivy-cache >/dev/null

check_image() {
  image=$1
  label=$2
  archive="$work_dir/$label.tar"

  docker image inspect "$image" >/dev/null
  docker save --output "$archive" "$image"

  docker run --rm --user "$(id -u):$(id -g)" \
    --env HOME=/tmp \
    --volume "$archive:/input/image.tar:ro" \
    --volume "$OUTPUT_DIR:/output" \
    --volume "$work_dir/syft-tmp:/tmp" \
    "$SYFT_IMAGE" "docker-archive:/input/image.tar" \
    --output "spdx-json=/output/$label.spdx.json"

  docker run --rm \
    --env TRIVY_DISABLE_VEX_NOTICE=true \
    --volume "$archive:/input/image.tar:ro" \
    --volume bora-trivy-cache:/root/.cache/trivy \
    "$TRIVY_IMAGE" image --input /input/image.tar \
    --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --table-mode detailed --quiet --exit-code 1
}

check_image "$API_IMAGE" bora-api
check_image "$WEB_IMAGE" bora-web
printf 'SBOMs written to %s; image vulnerability gates passed.\n' "$OUTPUT_DIR"
