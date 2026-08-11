import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = join(repository, 'server/migrations');
const migrations = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort();
const postgresImage = 'postgres:16.14-alpine3.24@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const container = `bora-migrations-${process.pid}-${randomBytes(4).toString('hex')}`;
const password = randomBytes(18).toString('hex');
let started = false;

function execute(command, args, { input, env, quiet = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repository,
    encoding: 'utf8',
    input,
    env: { ...process.env, ...env },
    stdio: quiet && input === undefined ? 'ignore' : ['pipe', 'pipe', 'pipe']
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
  return result;
}

function docker(args, options) {
  return execute('docker', args, options);
}

function cleanup() {
  if (!started) return;
  docker(['rm', '-f', container], { quiet: true, allowFailure: true });
  started = false;
}

process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });

function psql(database, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-Atq'
  ], { input: sql }).stdout.trim();
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function createDatabase(database) {
  // The official image briefly accepts connections on its initialization
  // server, then restarts into its final server. pg_isready can report ready
  // during that handoff, so retry database creation through the transition.
  let result;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    result = docker(['exec', container, 'createdb', '-U', 'postgres', database], { allowFailure: true });
    if (result.status === 0) return;
    pause(250);
  }
  if (result?.stdout) process.stdout.write(result.stdout);
  if (result?.stderr) process.stderr.write(result.stderr);
  throw new Error(`Could not create ${database} in disposable PostgreSQL`);
}

function bootstrap(database, migrationCount) {
  psql(database, `
    create table schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  for (const name of migrations.slice(0, migrationCount)) {
    const sql = readFileSync(join(migrationDirectory, name), 'utf8');
    const escapedName = name.replaceAll("'", "''");
    psql(database, `begin;\n${sql}\ninsert into schema_migrations (name) values ('${escapedName}');\ncommit;`);
  }
}

function runMigrator(database, port) {
  execute(process.execPath, ['server/migrate.mjs'], {
    env: {
      PGHOST: '127.0.0.1',
      PGPORT: port,
      PGDATABASE: database,
      PGUSER: 'postgres',
      PGPASSWORD: password
    }
  });
}

function verifyCurrentSchema(database) {
  const output = psql(database, readFileSync(join(repository, 'deploy/verify-backup.sql'), 'utf8'));
  if (!output.startsWith(`bora-backup-ok|migrations=${migrations.length}|`)) {
    throw new Error(`Current-schema verification failed for ${database}: ${output}`);
  }
}

if (!migrations.length) throw new Error('No SQL migrations were found');
migrations.forEach((name, index) => {
  const expectedPrefix = String(index + 1).padStart(3, '0');
  if (!name.startsWith(`${expectedPrefix}_`)) {
    throw new Error(`Migration sequence is not contiguous at ${name}; expected ${expectedPrefix}_`);
  }
});

// Automatic runtime rollback cannot reverse a database migration. Keep every
// post-bootstrap migration additive and compatible with the immediately prior
// API image; unusual changes require a separately reviewed expand/contract
// sequence rather than bypassing this gate.
const rollbackUnsafePatterns = [
  [/\bdrop\s+(?:table|column|schema|type|constraint)\b/i, 'DROP of schema objects'],
  [/\btruncate\b/i, 'TRUNCATE'],
  [/\bdelete\s+from\b/i, 'DELETE'],
  [/\brename\s+(?:column|to)\b/i, 'schema rename'],
  [/\balter\s+column\s+\S+\s+type\b/i, 'column type replacement'],
  [/\bset\s+not\s+null\b/i, 'new NOT NULL constraint'],
  [/\badd\s+constraint\b/i, 'new table constraint']
];
for (const name of migrations.slice(1)) {
  const sql = readFileSync(join(migrationDirectory, name), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
  for (const [pattern, description] of rollbackUnsafePatterns) {
    if (pattern.test(sql)) {
      throw new Error(`${name} contains rollback-unsafe ${description}; use an additive expand/contract migration`);
    }
  }
}

try {
  docker([
    'run', '-d', '--name', container,
    '--tmpfs', '/var/lib/postgresql/data',
    '-p', '127.0.0.1::5432',
    '-e', `POSTGRES_PASSWORD=${password}`,
    postgresImage
  ]);
  started = true;

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = docker(
      ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
      { quiet: true, allowFailure: true }
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    pause(250);
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready');

  const portOutput = docker(['port', container, '5432/tcp']).stdout.trim().split('\n')[0];
  const port = portOutput.match(/:(\d+)$/)?.[1];
  if (!port) throw new Error(`Could not resolve disposable PostgreSQL port from: ${portOutput}`);

  createDatabase('bora_fresh');
  runMigrator('bora_fresh', port);
  runMigrator('bora_fresh', port);
  verifyCurrentSchema('bora_fresh');
  process.stdout.write(`Fresh migration and idempotent rerun passed (${migrations.length} migrations).\n`);

  createDatabase('bora_from_001');
  bootstrap('bora_from_001', 1);
  psql('bora_from_001', `
    insert into events
      (id, slug, admin_token_hash, mode, title, place, threshold, starts_at, created_by_name)
    values
      ('legacy-event-001', 'legacy-001', 'hash', 'agora', 'Legado', 'Praça', 2,
       '2099-08-01T21:00:00Z', 'Ana');
    insert into votes
      (id, event_id, participant_id, voter_name, response, preferred_option)
    values
      ('legacy-vote-001', 'legacy-event-001', 'legacy-person', 'Ana', 'accept', null);
  `);
  runMigrator('bora_from_001', port);
  verifyCurrentSchema('bora_from_001');
  const initialUpgradeOk = psql('bora_from_001', `
    select count(*) = 1
       and bool_and(created_by_participant_id = 'legacy-person')
       and bool_and(event_timezone is null)
       and bool_and(revision = 0)
       and bool_and(reminder_starts_at = starts_at)
      from events where id = 'legacy-event-001';
  `);
  if (initialUpgradeOk !== 't') throw new Error('Upgrade from migration 001 did not preserve/backfill the legacy event');
  process.stdout.write('Representative upgrade from migration 001 passed with legacy data preserved.\n');

  createDatabase('bora_from_008');
  bootstrap('bora_from_008', 8);
  psql('bora_from_008', `
    insert into events
      (id, slug, admin_token_hash, mode, title, place, threshold, starts_at,
       alternatives, days, created_by_name, decided_option, created_by_participant_id)
    values
      ('legacy-event-008', 'legacy-008', 'hash', 'marcar', 'Legado 8', 'Praça', 2,
       null, '[]'::jsonb,
       '[{"id":"sabado","label":"sáb. 01","date":"2099-08-01","slots":["18:00"]}]'::jsonb,
       'Ana', 'sabado:18:00', 'legacy-person-008');
  `);
  runMigrator('bora_from_008', port);
  verifyCurrentSchema('bora_from_008');
  const recentUpgradeOk = psql('bora_from_008', `
    select count(*) = 1
       and bool_and(event_timezone is null)
       and bool_and(revision = 0)
       and bool_and(reminder_starts_at is null)
      from events where id = 'legacy-event-008';
  `);
  if (recentUpgradeOk !== 't') throw new Error('Upgrade from migration 008 did not preserve/backfill the legacy event');
  process.stdout.write('Representative upgrade from migration 008 passed with legacy data preserved.\n');
} finally {
  cleanup();
}
