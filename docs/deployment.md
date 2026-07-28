# Deploying Bora

## Recommended first deployment

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

## Backups

The event data lives in PostgreSQL. Back up the database regularly:

```bash
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > bora-backup.sql
```

Restore into an empty database only after testing the backup procedure in a non-production environment.

## Updating

```bash
git pull
docker compose up -d --build
```

New SQL files in `server/migrations` run once at API startup and are recorded in the `schema_migrations` table. Never edit a migration that has already reached a shared environment; add a new numbered migration instead.

## Security notes

- Treat creator links as secrets.
- Terminate HTTPS before traffic reaches the web container.
- Do not publish the PostgreSQL port.
- Use a unique production password and restrict server access.
- Before a public launch, add request rate limiting and automated database backups.
