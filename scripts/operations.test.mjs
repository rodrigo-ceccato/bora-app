import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'bora-operations-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function executable(directory, name, source) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, source);
  chmodSync(path, 0o755);
  return path;
}

function run(script, { args = [], cwd = repository, env = {} } = {}) {
  return spawnSync('/bin/sh', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

function fakeLogger(bin) {
  executable(bin, 'logger', '#!/bin/sh\nexit 0\n');
}

const sourceCounts = {
  migrations: 11,
  events: 3,
  votes: 7,
  recovery_tokens: 2,
  push_subscriptions: 2,
  push_notifications: 5,
  presence: 4
};

function countLine(counts = sourceCounts) {
  return Object.entries(counts).map(([key, value]) => `${key}=${value}`).join('|');
}

function fakeBackupDocker(bin, { dumpExit = 0, dump = 'create table backup_probe(id integer);' } = {}) {
  executable(bin, 'docker', `#!/bin/sh
case "$*" in
  *"psql -X -Atq"*)
    printf '%s\\n' 'BORA_SNAPSHOT|00000003-0000001B-1'
    printf '%s\\n' 'BORA_COUNTS|${countLine()}'
    printf '%s\\n' 'BORA_READY'
    cat >/dev/null
    ;;
  *pg_dump*)
    printf '%s\\n' '${dump}'
    exit ${dumpExit}
    ;;
  *) exit 97 ;;
esac
`);
}

function writeBackupPair(backups, { sql = 'select 1;', counts = sourceCounts, corruptChecksum = false } = {}) {
  mkdirSync(backups, { recursive: true });
  const name = 'bora-20990101T000000Z';
  const compressed = gzipSync(sql);
  const digest = createHash('sha256').update(compressed).digest('hex');
  writeFileSync(join(backups, `${name}.sql.gz`), compressed);
  writeFileSync(join(backups, `${name}.manifest`), [
    'format=bora-backup-manifest-v1',
    `dump=${name}.sql.gz`,
    `sha256=${corruptChecksum ? '0'.repeat(64) : digest}`,
    'snapshot=00000003-0000001B-1',
    ...Object.entries(counts).map(([key, value]) => `${key}=${value}`),
    ''
  ].join('\n'));
}

describe('database backup operations', () => {
  it('never promotes a partial pg_dump when the producer fails', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    fakeBackupDocker(bin, { dumpExit: 17, dump: 'partial sql output' });
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups
      }
    });

    expect(result.status).not.toBe(0);
    expect(readdirSync(backups).filter((name) => !name.startsWith('.'))).toEqual([]);
  });

  it('publishes an atomic gzip and exact source-snapshot manifest after every stage succeeds', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    fakeBackupDocker(bin);
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups
      }
    });

    expect(result.status, result.stderr).toBe(0);
    const files = readdirSync(backups).filter((name) => !name.startsWith('.')).sort();
    expect(files).toHaveLength(2);
    const archive = files.find((name) => name.endsWith('.sql.gz'));
    const manifest = files.find((name) => name.endsWith('.manifest'));
    expect(archive).toMatch(/^bora-.*\.sql\.gz$/);
    expect(manifest).toBe(archive.replace(/\.sql\.gz$/, '.manifest'));
    expect(gunzipSync(readFileSync(join(backups, archive))).toString()).toContain('backup_probe');
    const metadata = readFileSync(join(backups, manifest), 'utf8');
    expect(metadata).toContain(`dump=${archive}`);
    expect(metadata).toContain('events=3');
    expect(metadata).toContain('votes=7');
    expect(metadata).toContain('snapshot=00000003-0000001B-1');
  });

  it('retires old pairs atomically and removes only sufficiently old orphan dumps', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    mkdirSync(backups);
    const oldPairDump = join(backups, 'bora-20000101T000000Z.sql.gz');
    const oldPairManifest = join(backups, 'bora-20000101T000000Z.manifest');
    const oldOrphan = join(backups, 'bora-20000102T000000Z.sql.gz');
    const youngOrphan = join(backups, 'bora-20000103T000000Z.sql.gz');
    for (const path of [oldPairDump, oldPairManifest, oldOrphan]) writeFileSync(path, 'old');
    writeFileSync(youngOrphan, 'interrupted recently');
    const oldTime = new Date(Date.now() - 4 * 24 * 60 * 60_000);
    for (const path of [oldPairDump, oldPairManifest, oldOrphan]) utimesSync(path, oldTime, oldTime);
    fakeBackupDocker(bin);
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups,
        BORA_BACKUP_RETENTION_DAYS: '1'
      }
    });

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(oldPairManifest)).toBe(false);
    expect(existsSync(oldPairDump)).toBe(false);
    expect(existsSync(oldOrphan)).toBe(false);
    expect(existsSync(youngOrphan)).toBe(true);
    expect(readdirSync(backups).filter((name) => !name.startsWith('.')).sort()).toHaveLength(3);
  });

  it('fails a restored backup whose schema probe is incomplete and still drops the verification database', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    const log = join(root, 'docker.log');
    writeBackupPair(backups);
    executable(bin, 'docker', `#!/bin/sh
case "$*" in
  *dropdb*) printf '%s\n' cleanup >> "$FAKE_DOCKER_LOG" ;;
  *createdb*) printf '%s\n' created >> "$FAKE_DOCKER_LOG" ;;
  *-Atq*) cat >/dev/null; printf '%s\n' 'schema-incomplete' ;;
  *psql*) cat >/dev/null ;;
esac
`);
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup-verify.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups,
        FAKE_DOCKER_LOG: log
      }
    });

    expect(result.status).not.toBe(0);
    expect(readFileSync(log, 'utf8')).toContain('cleanup');
  });

  it('rejects a corrupt gzip archive before creating a verification database', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    const log = join(root, 'docker.log');
    mkdirSync(backups);
    writeFileSync(join(backups, 'bora-20990101T000000Z.sql.gz'), 'truncated-not-gzip');
    const digest = createHash('sha256').update('truncated-not-gzip').digest('hex');
    writeFileSync(join(backups, 'bora-20990101T000000Z.manifest'), [
      'format=bora-backup-manifest-v1',
      'dump=bora-20990101T000000Z.sql.gz',
      `sha256=${digest}`,
      'snapshot=00000003-0000001B-1',
      ...Object.entries(sourceCounts).map(([key, value]) => `${key}=${value}`),
      ''
    ].join('\n'));
    executable(bin, 'docker', `#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
`);
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup-verify.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups,
        FAKE_DOCKER_LOG: log
      }
    });

    expect(result.status).not.toBe(0);
    expect(existsSync(log)).toBe(false);
  });

  it('rejects a valid gzip whose restored rows do not match the source snapshot', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    const log = join(root, 'docker.log');
    writeBackupPair(backups);
    executable(bin, 'docker', `#!/bin/sh
case "$*" in
  *dropdb*) printf '%s\\n' cleanup >> "$FAKE_DOCKER_LOG" ;;
  *createdb*) printf '%s\\n' created >> "$FAKE_DOCKER_LOG" ;;
  *-Atq*) cat >/dev/null; printf '%s\\n' 'bora-backup-ok|migrations=11|events=0|votes=0|recovery_tokens=0|push_subscriptions=0|push_notifications=0|presence=0' ;;
  *psql*) cat >/dev/null ;;
esac
`);
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup-verify.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups,
        FAKE_DOCKER_LOG: log
      }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Restored events count 0 does not match source snapshot count 3');
    expect(readFileSync(log, 'utf8')).toContain('cleanup');
  });

  it('accepts a restored backup only when checksum, schema, and every source count match', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    const log = join(root, 'docker.log');
    writeBackupPair(backups);
    executable(bin, 'docker', `#!/bin/sh
case "$*" in
  *dropdb*) printf '%s\\n' cleanup >> "$FAKE_DOCKER_LOG" ;;
  *createdb*) printf '%s\\n' created >> "$FAKE_DOCKER_LOG" ;;
  *-Atq*) cat >/dev/null; printf '%s\\n' 'bora-backup-ok|${countLine()}' ;;
  *psql*) cat >/dev/null ;;
esac
`);
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup-verify.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups,
        FAKE_DOCKER_LOG: log
      }
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(log, 'utf8')).toContain('cleanup');
  });

  it('rejects a checksum mismatch before touching PostgreSQL', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const backups = join(root, 'backups');
    const log = join(root, 'docker.log');
    writeBackupPair(backups, { corruptChecksum: true });
    executable(bin, 'docker', `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
`);
    fakeLogger(bin);

    const result = run(join(repository, 'deploy/bora-backup-verify.sh'), {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        BORA_APP_DIR: repository,
        BORA_BACKUP_DIR: backups,
        FAKE_DOCKER_LOG: log
      }
    });

    expect(result.status).not.toBe(0);
    expect(existsSync(log)).toBe(false);
  });
});

describe('release smoke and rollback operations', () => {
  function fakeCurl(bin) {
    executable(bin, 'curl', `#!/bin/sh
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    --retry|--retry-delay|--max-time) shift 2 ;;
    --silent|--show-error|--fail|--retry-all-errors) shift ;;
    *) url=$1; shift ;;
  esac
done
case "$url" in
  */api/health) body='{"status":"ok"}' ;;
  */assets/app.js)
    [ "\${FAKE_ASSET_FAILURE:-0}" = 1 ] && exit 22
    body='console.log("bora")'
    ;;
  */) body='<html><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>' ;;
  *) exit 22 ;;
esac
if [ -n "$output" ]; then
  [ "$output" = /dev/null ] || printf '%s' "$body" > "$output"
else
  printf '%s' "$body"
fi
`);
  }

  it('checks health, the app shell, and a hashed application asset', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    fakeCurl(bin);
    const env = { PATH: `${bin}:${process.env.PATH}`, BORA_SMOKE_RETRIES: '0' };

    expect(run(join(repository, 'deploy/smoke-release.sh'), { args: ['https://bora.test', 'test'], env }).status).toBe(0);
    expect(run(join(repository, 'deploy/smoke-release.sh'), {
      args: ['https://bora.test', 'test'],
      env: { ...env, FAKE_ASSET_FAILURE: '1' }
    }).status).not.toBe(0);
  });

  it('restores the prior env and release marker when candidate smoke fails', () => {
    const root = temporaryDirectory();
    const bin = join(root, 'bin');
    const deploy = join(root, 'deploy');
    const dockerLog = join(root, 'docker.log');
    const smokeCount = join(root, 'smoke-count');
    const smokeLog = join(root, 'smoke.log');
    const previous = join(root, 'previous');
    mkdirSync(deploy);
    cpSync(join(repository, 'deploy/activate-release.sh'), join(deploy, 'activate-release.sh'));
    chmodSync(join(deploy, 'activate-release.sh'), 0o755);
    writeFileSync(join(root, 'compose.yaml'), 'services: { candidate: {} }\n');
    writeFileSync(join(root, 'compose.prod.yaml'), 'services: { candidate-production: {} }\n');
    writeFileSync(join(root, '.env'), 'BORA_PORT=9090\nBORA_DOMAIN=old.example\nBORA_API_IMAGE=old-api@sha256:1\nBORA_WEB_IMAGE=old-web@sha256:2\n');
    writeFileSync(join(root, '.env.next'), 'BORA_PORT=8080\nBORA_DOMAIN=new.example\nBORA_API_IMAGE=new-api@sha256:3\nBORA_WEB_IMAGE=new-web@sha256:4\n');
    writeFileSync(join(root, '.deployed-release'), 'v1.0.0 oldsha\n');
    executable(bin, 'docker', `#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
grep '^BORA_API_IMAGE=' .env >> "$FAKE_DOCKER_LOG" 2>/dev/null || true
`);
    const smokeScript = `#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_SMOKE_LOG"
count=0
[ ! -f "$FAKE_SMOKE_COUNT" ] || count=$(cat "$FAKE_SMOKE_COUNT")
count=$((count + 1))
printf '%s\n' "$count" > "$FAKE_SMOKE_COUNT"
[ "$count" -ne 1 ]
`;
    executable(deploy, 'smoke-release.sh', smokeScript);

    mkdirSync(join(previous, 'deploy'), { recursive: true });
    writeFileSync(join(previous, 'compose.yaml'), 'services: { previous: {} }\n');
    writeFileSync(join(previous, 'compose.prod.yaml'), 'services: { previous-production: {} }\n');
    executable(join(previous, 'deploy'), 'activate-release.sh', '#!/bin/sh\necho previous activation\n');
    executable(join(previous, 'deploy'), 'smoke-release.sh', smokeScript);
    const archived = spawnSync('tar', [
      '-czf', join(root, '.release-assets.previous.tgz'),
      '-C', previous,
      'compose.yaml', 'compose.prod.yaml', 'deploy'
    ], { encoding: 'utf8' });
    expect(archived.status, archived.stderr).toBe(0);

    const result = run('./deploy/activate-release.sh', {
      cwd: root,
      args: ['v2.0.0', 'abcdef', '8080', 'new.example'],
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_DOCKER_LOG: dockerLog,
        FAKE_SMOKE_COUNT: smokeCount,
        FAKE_SMOKE_LOG: smokeLog
      }
    });

    expect(result.status).not.toBe(0);
    expect(readFileSync(join(root, '.env'), 'utf8')).toContain('old-api@sha256:1');
    expect(readFileSync(join(root, '.env.previous'), 'utf8')).toContain('old-api@sha256:1');
    expect(readFileSync(join(root, '.deployed-release'), 'utf8')).toBe('v1.0.0 oldsha\n');
    expect(readFileSync(join(root, 'compose.yaml'), 'utf8')).toContain('previous');
    expect(readFileSync(join(root, 'compose.prod.yaml'), 'utf8')).toContain('previous-production');
    expect(readFileSync(join(root, 'deploy/activate-release.sh'), 'utf8')).toContain('previous activation');
    expect(readFileSync(dockerLog, 'utf8')).toContain('new-api@sha256:3');
    expect(readFileSync(dockerLog, 'utf8')).toContain('old-api@sha256:1');
    expect(readFileSync(smokeLog, 'utf8')).toContain('http://127.0.0.1:9090 rolled-back internal route');
    expect(readFileSync(smokeLog, 'utf8')).toContain('https://old.example rolled-back public route');
    expect(Number(readFileSync(smokeCount, 'utf8').trim())).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['0.0.0.0', '2', 'BORA_BIND must be 127.0.0.1'],
    ['127.0.0.1', '1', 'BORA_TRUST_PROXY_HOPS must be 2']
  ])('rejects an unsafe production proxy topology (%s, %s hops)', (bind, hops, message) => {
    const result = run(join(repository, 'deploy/release.sh'), {
      env: {
        BORA_HOST: 'deploy@example.invalid',
        BORA_REMOTE_DIR: '/opt/bora',
        BORA_API_IMAGE: 'registry.example/api@sha256:1',
        BORA_WEB_IMAGE: 'registry.example/web@sha256:2',
        BORA_RELEASE_TAG: 'v1.2.3',
        BORA_RELEASE_SHA: 'abcdef123',
        POSTGRES_DB: 'bora',
        POSTGRES_USER: 'bora',
        POSTGRES_PASSWORD: 'secret',
        BORA_PORT: '8080',
        BORA_BIND: bind,
        BORA_DOMAIN: 'bora.example',
        BORA_TLS_EMAIL: 'ops@example.com',
        DUCKDNS_DOMAIN: 'bora',
        DUCKDNS_TOKEN: 'secret',
        BORA_VAPID_PUBLIC_KEY: 'public',
        BORA_VAPID_PRIVATE_KEY: 'private',
        BORA_VAPID_SUBJECT: 'mailto:ops@example.com',
        BORA_TRUST_PROXY_HOPS: hops
      }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  });
});

describe('CI operations gates', () => {
  it.each(['verify.yml', 'release.yml'])('runs static, migration, and post-build image checks in %s', (name) => {
    const workflow = readFileSync(join(repository, '.github/workflows', name), 'utf8');
    expect(workflow).toContain('npm run verify:static');
    expect(workflow).toContain('npm run test:migrations');
    expect(workflow).toContain('npm run verify:images');
    expect(workflow.indexOf('npm run verify:images')).toBeGreaterThan(workflow.indexOf('docker compose up -d --build'));
  });
});
