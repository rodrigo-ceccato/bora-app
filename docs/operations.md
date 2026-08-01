# Operating the Bora VM

Runbook for the production host. See [deployment](deployment.md) for how the
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
Neither is tracked in git and neither is overwritten by a sync.

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

From your workstation, in a checkout of this repository:

```bash
./deploy/sync.sh
```

That rsyncs the working tree to `/opt/bora`, rebuilds the images, recreates the
containers, and checks `/api/health`. It writes the deployed git revision to
`.deployed-revision` so the host records what it is running.

Skip the image rebuild when only compose or config files changed:

```bash
./deploy/sync.sh --no-build
```

Target a different machine with environment variables:

```bash
BORA_HOST=rocky@203.0.113.10 BORA_REMOTE_DIR=/srv/bora ./deploy/sync.sh
```

### What the sync excludes

`.git`, `node_modules`, `dist`, `android`, `ios`, and `.env`. The sync uses
`--delete`, so files removed locally are removed on the host — but excluded
paths are never deleted, which is what protects the production `.env`.

### Deploying by hand

```bash
ssh rocky@147.15.84.15
cd /opt/bora
docker compose -f compose.yaml -f compose.prod.yaml up -d --build --remove-orphans
```

Builds run on the VM. With 1 GB of RAM the Vite build leans on swap and takes
roughly 30 seconds; that is expected, not a fault.

## Check what is running

```bash
docker compose -f compose.yaml -f compose.prod.yaml ps
cat /opt/bora/.deployed-revision
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

The DuckDNS token goes in **`deploy/duckdns.env`**, which is gitignored. Start
from the tracked template:

```bash
cp deploy/duckdns.env.example deploy/duckdns.env
$EDITOR deploy/duckdns.env      # set DUCKDNS_TOKEN
./deploy/setup-duckdns.sh
```

`setup-duckdns.sh` pipes the token over stdin to `/etc/duckdns.env` on the host
(mode 600, root-owned), enables the timer, and forces one update. The token is
never passed as a command argument, so it does not appear in the host's process
list, and `deploy/sync.sh` excludes `deploy/duckdns.env` so it is never copied
into `/opt/bora`.

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

Back up:

```bash
bora exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "bora-backup-$(date +%F).sql"
```

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
  14 days in `/var/backups/bora` with root-only permissions.
- `bora-backup-verify.timer` restores the newest dump into a temporary database
  every Sunday at 04:15 UTC, verifies migration metadata, then drops it.
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

## Rollback

```bash
git checkout <last-good-commit>
./deploy/sync.sh
```

Migrations are forward-only. Rolling code back does not roll the schema back,
so a rollback across a migration needs a new migration that reverses it.

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
| Build killed mid-deploy | `free -m`; the 4 GB swapfile at `/.swapfile` must be active |
| Wrong version live | `cat /opt/bora/.deployed-revision` |
