#!/bin/sh
# Root-owned helper for GitHub Actions. It accepts exactly two environment
# assignments on stdin and writes the DuckDNS credentials without evaluating
# untrusted shell input.
set -eu

domain=''
token=''
seen_domain=0
seen_token=0

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    DUCKDNS_DOMAIN=*)
      [ "$seen_domain" -eq 0 ] || { echo 'duplicate DUCKDNS_DOMAIN' >&2; exit 1; }
      domain=${line#DUCKDNS_DOMAIN=}
      seen_domain=1
      ;;
    DUCKDNS_TOKEN=*)
      [ "$seen_token" -eq 0 ] || { echo 'duplicate DUCKDNS_TOKEN' >&2; exit 1; }
      token=${line#DUCKDNS_TOKEN=}
      seen_token=1
      ;;
    *)
      echo 'expected only DUCKDNS_DOMAIN and DUCKDNS_TOKEN assignments' >&2
      exit 1
      ;;
  esac
done

[ "$seen_domain" -eq 1 ] && [ "$seen_token" -eq 1 ] || {
  echo 'missing DuckDNS credentials' >&2
  exit 1
}

case "$domain" in
  ''|*[!a-z0-9-]*|.*|*.)
    echo 'DUCKDNS_DOMAIN must be a bare lowercase DuckDNS label' >&2
    exit 1
    ;;
esac
case "$token" in
  ''|*[!A-Za-z0-9-]*)
    echo 'DUCKDNS_TOKEN contains unsupported characters' >&2
    exit 1
    ;;
esac

tmp_file=$(mktemp /etc/duckdns.env.XXXXXX)
trap 'rm -f "$tmp_file"' EXIT HUP INT TERM
umask 077
printf 'DUCKDNS_DOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$domain" "$token" > "$tmp_file"
install -o root -g root -m 600 "$tmp_file" /etc/duckdns.env
