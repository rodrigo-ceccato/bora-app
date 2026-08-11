# Off-host restore drill decision

The automated `bora-backup-verify` timer proves that the newest local archive
can be decompressed, restored, and queried against Bora's required migrations,
tables, columns, and exact application-table row counts captured from the same
exported snapshot as `pg_dump`. It does **not** protect against loss of the
production host or its local backup volume.

Decision: production operations require an encrypted off-host copy and a
quarterly restore drill on an isolated machine. The operator should also run
the drill before any destructive database or host migration. A drill is only
complete when all of the following evidence has been retained:

1. The archive was retrieved from the off-host destination, not copied from
   `/var/backups/bora` during the drill.
2. Its recorded checksum was verified before decryption/decompression.
3. It restored into a new PostgreSQL instance with no production volumes
   mounted.
4. `deploy/verify-backup.sql` returned a `bora-backup-ok` result.
5. The date, archive identifier, result, and operator were recorded outside the
   production host.

Current status: this repository does not configure an off-host storage provider,
encryption keys, retention policy, or drill evidence store, and no off-host
drill was executed as part of this change. Those choices require deployment
owner approval and credentials; until they are configured, host-loss recovery
remains an explicit operational gap.
