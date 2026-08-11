# Bora

Bora is a mobile-first link for deciding short social events without requiring guests to create accounts.

## Product modes

- **Bora Agora** — see who is up for going today.
- **Bora Mais Tarde** — choose a main time and same-day alternatives.
- **Bora Marcar** — cross availability over several days and hours.

The creator is automatically counted as confirmed. Guests receive a public link, enter a name, and can change their response from the same browser.

## What is included

- Invitees can choose every time that works; creators can select the final time.
- Decided events offer Google Calendar and downloadable ICS calendar entries.
- **Meus Boras** keeps created and joined events available on the same device.
- A recovery link can move that participant identity (and optionally saved
  creator links) to another device.
- Web Push reminders are optional and require VAPID configuration on the host.

## Stack

- Ionic React, Vite, and Capacitor
- Small Node.js HTTP API
- PostgreSQL 16
- Docker Compose and nginx for self-hosting

Administrator tokens are returned only when an event is created, stored as hashes in PostgreSQL, and sent as bearer credentials for creator actions. They are never included in public event responses.

## Fast local demo

This mode stores everything in the current browser:

```bash
nvm use
npm ci
npm run dev
```

The supported toolchain is pinned in `.nvmrc` and `package.json` (Node
22.23.2 with npm 10.9.8). npm warns when a different local runtime is used;
CI and the Docker build use the pinned versions.

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
npm run verify
npm run test:e2e:smoke
npm run test:e2e:full
npm run test:e2e:local
npm run verify:ops
npm run test:migrations
npm run verify:static
```

`npm run test:e2e` is an alias for the fast Chromium smoke suite. The full suite
adds a Pixel touch profile, desktop Firefox, and an iPhone/WebKit touch profile.
Both use the stack at `http://127.0.0.1:8080`; set `PLAYWRIGHT_BASE_URL` to target
another non-production environment.

`npm run test:e2e:local` rebuilds and starts the local Compose stack, waits for
the API health check and then runs the full browser/device suite. The versioned
pre-push hook runs this command automatically before a direct push to `main`;
`npm install` configures the hook through the `prepare` script. The local stack
and its database volume are left running after the check.

`npm run verify:all` is the single, intentionally heavy local equivalent of
the required CI gates: tests, coverage, timezones, lint/typecheck, build
budgets, dependency/configuration/static security checks, disposable migration
upgrades, the full Compose E2E matrix, image SBOM generation, and vulnerability
scans. It requires Docker and locally installed Playwright browsers.

See the [MVP test checklist](docs/mvp-test-checklist.md) before sharing the app.

## Production host

The live instance runs on a small Oracle VM behind Caddy. Production releases
are built in GitHub Actions from an annotated stable tag; the workflow publishes
the GitHub Release only after deployment succeeds. Do not run a production
build from a workstation.

See the [GitHub Actions deployment guide](docs/github-actions-deploy.md) for
the required Environment configuration and the [operations runbook](docs/operations.md)
for logs, backups, rollback, DNS, and Web Push setup.

## Mobile packaging

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Use `ios` instead of `android` on macOS with Xcode.
