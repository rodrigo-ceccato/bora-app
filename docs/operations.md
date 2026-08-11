# Operating the Bora VM

Runbook for the production host. See [GitHub Actions deployment](github-actions-deploy.md) for how the
stack is put together and [the MVP checklist](mvp-test-checklist.md) for
pre-launch verification.

## The host

| | |
| --- | --- |
| SSH | `ssh rocky@147.15.84.15` |
| OS | Rocky Linux 9.6, x86_64, 2 vCPU, 1 GB RAM, 4 GB swap |
| App directory | `/opt/bora` |
| Compose files | `compose.yaml` + `compose.prod.yaml` |
| Public hostname | `bora-app.duckdns.org` |
| Public ports | 80 and 443 (Caddy) |

The `rocky` user is in the `docker` group, so `docker` runs without `sudo`.
Secrets live in `/opt/bora/.env` (mode 600) and `/etc/duckdns.env` (mode 600).
GitHub Actions regenerates both from the `production` Environment on every
release; neither is tracked in git or copied from a workstation.

## Web Push reminders

Web Push is optional but enabled in production when these GitHub `production`
Environment values are present: `BORA_VAPID_PUBLIC_KEY` (variable) and
`BORA_VAPID_PRIVATE_KEY` (secret). Bora reuses `BORA_TLS_EMAIL` as the required
Web Push contact address. Generate the pair with:

```bash
npx web-push generate-vapid-keys
```

After the next release, users can opt in through **Meus Boras → Ativar
lembretes neste aparelho**. The API sends confirmation and change notices,
plus reminders about 24 hours and two hours before a scheduled Bora. iPhone
users must add Bora to the Home Screen before Safari offers notifications.

## Connect

```bash
ssh rocky@147.15.84.15
cd /opt/bora
```

Every compose command on the host needs both files. Define a shorthand:

```bash
alias bora='docker compose -f /opt/bora/compose.yaml -f /opt/bora/compose.prod.yaml'
```

Omitting `-f compose.prod.yaml` drops Caddy and the PostgreSQL tuning, and
republishes the web container on all interfaces. Always pass both.

## Deploy a new version

Create and push an annotated stable `vX.Y.Z` tag from `main`. **Release deploy**
starts automatically, verifies the tag, builds and publishes public GHCR
images, syncs the deployment assets, pulls the exact image digests on the VM,
checks both health endpoints, and only then publishes the GitHub Release. See
[GitHub Actions production deployments](github-actions-deploy.md) for the
one-time setup.

### What the sync excludes

`.git`, `node_modules`, `dist`, `android`, `ios`, and runtime secrets. The
release sync uses `--delete`, while excluding `.env`, DuckDNS credentials, and
the deployed-release marker. GitHub Actions is the source of truth for the
excluded secret files.

### Deploying by hand

Do not build or deploy production images by hand. Re-run a prior successful
**Release deploy** workflow to roll back to its exact image digests.

## Check what is running

```bash
docker compose -f compose.yaml -f compose.prod.yaml ps
cat /opt/bora/.deployed-release
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS https://bora-app.duckdns.org/api/health
```

## Logs

```bash
bora logs -f --tail 100          # everything
bora logs -f api                 # API only
bora logs --tail 50 caddy        # certificate issuance and renewal
journalctl -u duckdns.service -n 20 --no-pager
systemctl status bora.service
```

## Restart and reboot

The stack is managed by `bora.service`, which is enabled at boot, and every
container carries `restart: unless-stopped`. A reboot brings the whole stack
back with no manual step.

```bash
sudo systemctl restart bora.service   # restart the stack
sudo systemctl stop bora.service      # stop it
sudo reboot                           # comes back automatically
```

`docker.service` and `duckdns.timer` are enabled at boot as well.

## DNS

### Credentials

Store `DUCKDNS_TOKEN` as a `production` GitHub Environment secret and
`DUCKDNS_DOMAIN` as its Environment variable. Every release sends them over
stdin to the root-owned validated helper, which writes `/etc/duckdns.env` with
mode 600. The token is never part of the repository, an image, or a command
argument.

`DUCKDNS_DOMAIN` is the bare label — `bora-app`, not `bora-app.duckdns.org`.

### Refresh

`duckdns.timer` runs `/usr/local/bin/duckdns-update.sh` every five minutes and
on boot, repointing `bora-app.duckdns.org` at the host's current public IP. It
reads `/etc/duckdns.env`.

```bash
systemctl list-timers duckdns.timer --no-pager
sudo systemctl start duckdns.service     # force an update now
dig +short bora-app.duckdns.org
```

## TLS

Caddy obtains and renews the Let's Encrypt certificate automatically and stores
it in the `caddy_data` volume, so certificates survive container rebuilds. It
needs `bora-app.duckdns.org` to resolve to this host and inbound port 80 to be
reachable.

Force a fresh issuance attempt after a DNS change:

```bash
bora up -d --force-recreate caddy
bora logs --tail 50 caddy
```

## Database

```bash
bora exec database psql -U bora -d bora
```

Create the same checked backup pair used by the timer:

```bash
sudo systemctl start bora-backup.service
sudo systemctl start bora-backup-verify.service
```

Each completed backup consists of `bora-<UTC timestamp>.sql.gz` plus a
`bora-<UTC timestamp>.manifest`. The backup script holds an exported
`REPEATABLE READ` snapshot open while it runs both `pg_dump` and the source row
counts, so concurrent application writes continue normally but cannot make the
manifest disagree with the dump. The manifest is published last and records
the compressed-file SHA-256 plus representative counts. Verification checks
the checksum, restores into an isolated database, validates the current schema,
and requires every restored count to equal the exact source snapshot count.
Backup creation, verification, and retention share a lock so a verifier cannot
race a partial publication or deletion.

Data lives in the `bora_database` Docker volume and survives `up`, `down`, and
rebuilds. It does **not** survive `docker compose down -v` — that flag destroys
the volume.

## Pilot operations

Run this once from a current checkout after deploying the operations assets:

```bash
./deploy/setup-operations.sh
```

It installs three systemd timers on the VM:

- `bora-backup.timer` creates a compressed SQL dump daily at 03:20 UTC, keeping
  14 days of complete dump/manifest pairs in `/var/backups/bora` with root-only
  permissions.
- `bora-backup-verify.timer` restores the newest dump into a temporary database
  every Sunday at 04:15 UTC, verifies checksum, migration metadata, columns,
  and exact source row counts, then drops it.
- `bora-healthcheck.timer` checks both loopback and the public HTTPS health URL
  every five minutes. Failures are logged at error priority in journald.

Run or inspect them manually:

```bash
sudo systemctl start bora-backup.service
sudo systemctl start bora-backup-verify.service
sudo systemctl start bora-healthcheck.service
sudo systemctl list-timers bora-backup.timer bora-backup-verify.timer bora-healthcheck.timer
sudo journalctl -u bora-backup.service -u bora-backup-verify.service -u bora-healthcheck.service -n 80 --no-pager
sudo ls -lh /var/backups/bora
```

The backup directory is intentionally host-local. Before inviting people beyond
the private pilot, copy it to an encrypted off-host destination and periodically
practice a restore there.

The forced-failure, corrupt-archive, checksum, and data-loss cases are local
regression tests:

```bash
npm run test:ops
```

## Verification and pilot load smoke

CI runs digest-pinned actionlint, ShellCheck, Hadolint, and Gitleaks tools; fresh
and representative historical migration upgrades; dependency audits; build
budgets; browser tests; and Trivy scans of both runtime images. It writes SPDX
JSON SBOM artifacts for the API and web images. Release image publication also
attaches BuildKit provenance and SBOM attestations.

For an isolated local/pilot stack, run the bounded synthetic API workload with
an explicit target:

```bash
BORA_LOAD_BASE_URL=http://127.0.0.1:8080 npm run load:smoke
```

Defaults are 6 virtual users, 2 temporary events, and 3 rounds. The pilot gate
allows at most 1% errors, 400 ms read p95, and 750 ms write p95. Override them
with `BORA_LOAD_CONCURRENCY`, `BORA_LOAD_EVENTS`, `BORA_LOAD_ROUNDS`,
`BORA_LOAD_MAX_ERROR_RATE`, `BORA_LOAD_READ_P95_MS`, and
`BORA_LOAD_WRITE_P95_MS`. The harness creates and best-effort deletes synthetic
events while exercising voting, organizer edits, polling, presence, My Events,
rate limiting, row locks, and the database pool.

Remote targets are refused unless
`BORA_LOAD_ALLOW_REMOTE=I_UNDERSTAND_THIS_CREATES_AND_DELETES_DATA` is also set.
Use a disposable pilot database: a killed process may prevent best-effort
cleanup. This smoke is not a production capacity test and does not exercise
Web Push delivery or reminder timing.

## Rollback

Push a new annotated stable tag that points to the last good commit. The
workflow uses the corresponding immutable image digests. Migrations are
forward-only: the automatic failed-candidate path restores the prior Compose
and deploy assets, environment, release marker, and immutable image digests,
but never rewinds the database. Every migration after the initial schema must
therefore be additive and compatible with the immediately previous API image.
`npm run test:migrations` rejects common destructive/tightening SQL and verifies
fresh, idempotent, migration-001, and migration-008 upgrades. Changes that need
an incompatible schema transition must use a reviewed expand/contract sequence
across releases.

## Firewall and cloud networking

There is no host firewall — firewalld is inactive and no nftables rules are
loaded. Inbound access is governed entirely by the Oracle Cloud VCN security
list for the instance's subnet, which already permits 22, 80, and 443.

To change it: Oracle Cloud console → Networking → Virtual Cloud Networks →
your VCN → Subnets → your subnet → Security Lists → Ingress Rules.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Site unreachable, `/api/health` fine on loopback | `bora logs caddy`, then `dig +short bora-app.duckdns.org` |
| Certificate errors | `bora logs caddy`; confirm port 80 is reachable from outside |
| `502` from Caddy | `bora ps`; the `web` container is down or unhealthy |
| API `500`s | `bora logs api`; usually the database is unreachable |
| Image pull fails | Confirm the GHCR packages are public and the VM can reach `ghcr.io` |
| Wrong version live | `cat /opt/bora/.deployed-release` |
