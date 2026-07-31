# Bora

Bora is a mobile-first link for deciding short social events without requiring guests to create accounts.

## Product modes

- **Bora Agora** — see who is up for going today.
- **Bora Mais Tarde** — choose a main time and same-day alternatives.
- **Bora Marcar** — cross availability over several days and hours.

The creator is automatically counted as confirmed. Guests receive a public link, enter a name, and can change their response from the same browser.

## Stack

- Ionic React, Vite, and Capacitor
- Small Node.js HTTP API
- PostgreSQL 16
- Docker Compose and nginx for self-hosting

Administrator tokens are returned only when an event is created, stored as hashes in PostgreSQL, and sent as bearer credentials for creator actions. They are never included in public event responses.

## Fast local demo

This mode stores everything in the current browser:

```bash
npm install
npm run dev
```

Do not use browser-only mode for testing links on different devices.

## Full local stack with Docker

```bash
cp .env.docker.example .env
```

Replace `POSTGRES_PASSWORD`, then run:

```bash
docker compose up --build
```

Open `http://localhost:8080`. PostgreSQL data is kept in the `bora_database` Docker volume.

## Develop the web app and API separately

Start PostgreSQL, provide `DATABASE_URL`, and run:

```bash
npm run db:migrate
npm run api
```

In another terminal:

```bash
cp .env.example .env
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8787`.

## Verification

```bash
npm test
npm run lint
npm run build
docker compose config
```

See [deployment](docs/deployment.md) and the [MVP test checklist](docs/mvp-test-checklist.md) before sharing the app.

## Production host

The live instance runs on a small Oracle VM behind Caddy. To ship a new version
from a checkout:

```bash
./deploy/sync.sh
```

See the [operations runbook](docs/operations.md) for connecting, deploying,
logs, backups, rollback, and DNS.

## Mobile packaging

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Use `ios` instead of `android` on macOS with Xcode.
