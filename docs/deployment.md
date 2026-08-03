# Deploying Bora

## Production deployment

The Bora production VM is deployed only by the GitHub Release workflow. Follow
the [GitHub Actions production deployments](github-actions-deploy.md) guide to
configure the `production` Environment, VM deployment key, and one-time
DuckDNS helper. The workflow creates the production `/opt/bora/.env` from
Environment values; do not copy a local secret file to the VM.

## Manual first deployment

This is only for a separate non-production or self-managed host. The current
production VM uses the release workflow above.

Use one Linux server with Docker and Docker Compose. Put a TLS reverse proxy such as Caddy, Traefik, or your hosting provider's HTTPS proxy in front of Bora.

1. Copy the repository to the server.
2. Copy `.env.docker.example` to `.env`.
3. Set a long random `POSTGRES_PASSWORD`.
4. Keep port 5432 private; the Compose file does not publish it.
5. Run `docker compose up -d --build`.
6. Point the public HTTPS hostname at the `web` service (port 8080 by default).
7. Verify `/api/health`, create an event, and open its invite link in a private browser.

The nginx container serves the application, rewrites client routes such as `/e/:slug` to `index.html`, and proxies `/api` to the API container.

## Services

- `web`: static Vite build and nginx reverse proxy
- `api`: Node API; applies SQL migrations before starting
- `database`: PostgreSQL 16 with a persistent named volume
- `caddy`: TLS termination and automatic Let's Encrypt certificates (`compose.prod.yaml` only)

## Production overlay with HTTPS

`compose.prod.yaml` adds a Caddy container on ports 80 and 443 that terminates
TLS and proxies to `web`, and trims PostgreSQL's memory footprint so the stack
fits on a 1 GB VM.

Add to `.env`:

```
BORA_BIND=127.0.0.1
BORA_DOMAIN=your-host.example.org
BORA_TLS_EMAIL=you@example.org
```

`BORA_BIND=127.0.0.1` keeps the plain-HTTP `web` port on loopback so the only
public entry points are Caddy's. Then run:

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

Caddy requests a certificate on first start, so `BORA_DOMAIN` must already
resolve to the server and inbound 80/443 must be reachable. Certificates are
kept in the `caddy_data` volume and renew automatically.

## Dynamic DNS with DuckDNS

For a server without a static hostname, `deploy/duckdns-update.sh` plus the
matching systemd service and timer keep a DuckDNS subdomain pointed at the
machine's current public IP.

```bash
sudo install -m 755 deploy/duckdns-update.sh /usr/local/bin/duckdns-update.sh
sudo install -m 644 deploy/duckdns.service /etc/systemd/system/
sudo install -m 644 deploy/duckdns.timer /etc/systemd/system/
printf 'DUCKDNS_DOMAIN=your-subdomain\nDUCKDNS_TOKEN=your-token\n' | sudo tee /etc/duckdns.env >/dev/null
sudo chmod 600 /etc/duckdns.env
sudo systemctl daemon-reload
sudo systemctl enable --now duckdns.timer
```

`DUCKDNS_DOMAIN` is the bare label (`bora-app`), not the full hostname. The
timer refreshes the record every five minutes and on boot.

## Backups

The event data lives in PostgreSQL. Back up the database regularly:

```bash
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > bora-backup.sql
```

Restore into an empty database only after testing the backup procedure in a non-production environment.

## Updating

Publish a stable `vX.Y.Z` GitHub Release from a commit on `main`. GitHub
Actions verifies the tag, builds digest-pinned API and web images in GHCR, and
restarts the VM with those images. See [GitHub Actions production
deployments](github-actions-deploy.md).

Do not build production images on the VM or update it from a workstation.

New SQL files in `server/migrations` run once at API startup and are recorded in the `schema_migrations` table. Never edit a migration that has already reached a shared environment; add a new numbered migration instead.

## Security notes

- Treat creator links as secrets.
- Terminate HTTPS before traffic reaches the web container.
- Do not publish the PostgreSQL port.
- Use a unique production password and restrict server access.
- Before a public launch, add request rate limiting and automated database backups.
