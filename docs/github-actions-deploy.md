# GitHub Actions production deployments

Production deployments begin when an annotated stable tag such as `v1.0.0` is
pushed. The workflow verifies the tagged checkout, builds the API and web
images in GitHub Actions, publishes them to GHCR, deploys their immutable
digests to the Oracle VM, and only then publishes the GitHub Release.

Only tags matching `vX.Y.Z` are accepted, and the tagged commit must be an
ancestor of `main`. Pre-release tags do not deploy.

## One-time GitHub setup

1. Rename the repository's default branch from `master` to `main` in GitHub,
   then rename your local branch and push it:

   ```bash
   git branch -m master main
   git push -u origin main
   ```

   Delete `master` from the remote only after GitHub has made `main` the
   default branch.
2. In **Settings → Environments**, create `production`. Restrict deployments
   to tag pattern `v*`; do not add required reviewers if releases should deploy
   automatically.
3. Add these **Environment secrets**:

   | Name | Value |
   | --- | --- |
   | `DEPLOY_SSH_PRIVATE_KEY` | Dedicated passphrase-free Ed25519 private key for the `rocky` account. |
   | `POSTGRES_PASSWORD` | The existing production PostgreSQL password. Do not change it during the first deployment; it must be a single-line Compose value (a 64-character hex password is ideal). |
   | `DUCKDNS_TOKEN` | The existing DuckDNS token. |
   | `BORA_TLS_EMAIL` | Your certificate-contact email address. |
   | `BORA_VAPID_PRIVATE_KEY` | Private half of the Web Push VAPID key pair. |

4. Add these **Environment variables**:

   | Name | Value |
   | --- | --- |
   | `DEPLOY_HOST` | `147.15.84.15` |
   | `DEPLOY_USER` | `rocky` |
   | `DEPLOY_PATH` | `/opt/bora` |
   | `DEPLOY_SSH_KNOWN_HOSTS` | Verified output of `ssh-keyscan -H -t ed25519 147.15.84.15` |
   | `POSTGRES_DB` | `bora` |
   | `POSTGRES_USER` | `bora` |
   | `BORA_BIND` | `127.0.0.1` |
   | `BORA_PORT` | `8080` |
   | `BORA_DOMAIN` | `bora-app.duckdns.org` |
   | `DUCKDNS_DOMAIN` | `bora-app` |
   | `BORA_VAPID_PUBLIC_KEY` | Public half of the Web Push VAPID key pair. |

Generate the VAPID key pair on a trusted machine, then put the private value
in the secret and the public value in the variable above. Bora uses
`BORA_TLS_EMAIL` as its required Web Push contact address. Never commit either
value or paste the private value into an issue or chat:

```bash
npx web-push generate-vapid-keys
```

`DEPLOY_SSH_KNOWN_HOSTS` is not a secret. Confirm its fingerprint against the
server over an existing trusted SSH connection before adding it; the workflow
does not disable host-key checking.

## One-time VM setup

Generate a dedicated deployment key on a trusted machine. It must not have a
passphrase because Actions cannot unlock one:

```bash
ssh-keygen -t ed25519 -a 100 -N '' -f ./bora-actions-deploy -C 'bora GitHub Actions deploy'
```

Append `bora-actions-deploy.pub` to `~rocky/.ssh/authorized_keys` on the VM,
store `bora-actions-deploy` in `DEPLOY_SSH_PRIVATE_KEY`, then remove the local
private-key file after a successful test.

From a trusted checkout that can already use `sudo` on the VM, install the
narrow DuckDNS helper:

```bash
./deploy/setup-github-actions.sh
```

It grants `rocky` passwordless sudo only for the root-owned
`bora-update-duckdns-env` helper. The helper validates and writes
`/etc/duckdns.env`; it does not grant arbitrary sudo access.

## First release and normal operation

1. Push the Actions/deployment changes to `main` and wait for **Verify** to
   pass.
2. Create and push an **annotated** `vX.Y.Z` tag from the verified `main`
   commit. Its annotation becomes the GitHub Release notes and must include a
   user-visible summary in this exact shape:

   ```md
   ## What users will notice

   - A short, concrete change users can notice or use.
   - Another visible improvement, if applicable.
   ```

   Create it with `npm run release:tag -- vX.Y.Z` (your editor opens for the
   annotation), then run `git push origin vX.Y.Z`. This command preserves
   Markdown headings verbatim—Git's default tag cleanup would otherwise
   discard the required `##` heading—and validates the tag before it can be
   pushed. The checked-in pre-push hook repeats the preflight automatically
   for every version tag, and the release workflow is the final safeguard.
   Technical-only changes should say plainly that there is no user-visible
   behavior change.
3. Pushing the tag starts **Release deploy** automatically. Watch the run
   through verification, image publishing, deployment, and GitHub Release
   publication. No public GitHub Release is created if any earlier stage fails.
4. Confirm `cat /opt/bora/.deployed-release` and
   `docker compose -f compose.yaml -f compose.prod.yaml ps` on the VM.
5. Reboot the VM once and verify the health endpoint again. Compose reads the
   Actions-generated `/opt/bora/.env` at boot.
6. Delete local untracked `.env` and `deploy/duckdns.env` after this succeeds.

The Docker images are public because this repository is public, so the VM pulls
them anonymously; no registry token is stored on the host. Runtime secrets are
not part of either image.

To roll back, push a new annotated stable tag that points to the prior commit.
The workflow deploys the corresponding images, then publishes that new release.
