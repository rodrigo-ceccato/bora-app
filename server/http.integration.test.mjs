import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const { Pool } = pg;
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const postgresImage = process.env.BORA_TEST_POSTGRES_IMAGE || 'postgres:16.14-alpine3.24@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const containerName = `bora-http-test-${process.pid}-${randomBytes(4).toString('hex')}`;
const postgresPassword = 'bora-integration-password';
const corsOrigin = 'https://app.bora.test';

async function commandWorks(command, args) {
  try {
    await execFileAsync(command, args, { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

const dockerAvailable = process.env.BORA_SKIP_DOCKER_INTEGRATION !== '1'
  && await commandWorks('docker', ['info']);
if (process.env.BORA_REQUIRE_DOCKER_INTEGRATION === '1' && !dockerAvailable) {
  throw new Error('Docker is required for the HTTP integration gate. Start Docker or use BORA_SKIP_DOCKER_INTEGRATION=1 only for an explicit unit-only run.');
}
const integration = dockerAvailable ? describe.sequential : describe.skip;

let databaseUrl = '';
let databasePool;
let api;
let apiBase = '';

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function unusedPort() {
  const listener = createNetServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForDatabase(url) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await delay(250);
    }
  }
  throw lastError || new Error('PostgreSQL did not become ready.');
}

async function runNode(script, environment) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}: ${output}`)));
  });
}

async function startApi() {
  const port = await unusedPort();
  const vapid = webpush.generateVAPIDKeys();
  const environment = {
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    CORS_ORIGIN: corsOrigin,
    BORA_TRUST_PROXY_HOPS: '0',
    BORA_VAPID_PUBLIC_KEY: vapid.publicKey,
    BORA_VAPID_PRIVATE_KEY: vapid.privateKey,
    BORA_VAPID_SUBJECT: 'mailto:integration@bora.test',
    BORA_PUSH_TIMEOUT_MS: '1000'
  };
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-20_000); });
  child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-20_000); });
  const base = `http://127.0.0.1:${port}/api`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited before readiness: ${output}`);
    try {
      const response = await globalThis.fetch(`${base}/health`);
      if (response.ok) {
        return {
          base,
          child,
          output: () => output,
          async stop() {
            if (child.exitCode !== null) return;
            child.kill('SIGTERM');
            await Promise.race([
              new Promise((resolve) => child.once('exit', resolve)),
              delay(5_000).then(() => child.kill('SIGKILL'))
            ]);
          }
        };
      }
    } catch { /* Retry until the listener is ready. */ }
    await delay(100);
  }
  child.kill('SIGKILL');
  throw new Error(`API did not become ready: ${output}`);
}

async function request(path, {
  method = 'GET', participantId, adminToken, body, rawBody, headers = {}, base = apiBase
} = {}) {
  const requestHeaders = {
    ...(participantId ? { 'x-participant-id': participantId } : {}),
    ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
    ...headers
  };
  let payload = rawBody;
  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return globalThis.fetch(`${base}${path}`, { method, headers: requestHeaders, body: payload });
}

async function json(response) {
  return response.json();
}

function futureEvent(overrides = {}) {
  return {
    mode: 'agora', title: 'Cinema', place: 'Centro', description: '', threshold: 2,
    startsAt: '2099-08-03T21:00:00.000Z', alternatives: [], days: [],
    createdByName: 'Ana', notifyCreatorOnVote: true, votingClosed: false,
    ...overrides
  };
}

async function createEvent(participantId, overrides = {}) {
  const response = await request('/events', {
    method: 'POST', body: { event: futureEvent(overrides), participantId }
  });
  expect(response.status).toBe(201);
  return json(response);
}

function voteBody(participantId, voterName, response = 'accept') {
  return { participantId, voterName, response, preferredOptions: [], availability: {} };
}

async function resetData() {
  await databasePool.query(`truncate table
    push_notifications, push_subscriptions, participant_recovery_tokens,
    participant_presence, votes, events restart identity cascade`);
}

integration('HTTP API with disposable PostgreSQL', () => {
  beforeAll(async () => {
    await execFileAsync('docker', [
      'run', '--detach', '--rm', '--name', containerName,
      '--env', `POSTGRES_PASSWORD=${postgresPassword}`,
      '--env', 'POSTGRES_USER=bora_test', '--env', 'POSTGRES_DB=bora_test',
      '--publish', '127.0.0.1::5432', postgresImage
    ], { timeout: 180_000 });
    const { stdout: portOutput } = await execFileAsync('docker', ['port', containerName, '5432/tcp']);
    const databasePort = portOutput.trim().match(/:(\d+)$/)?.[1];
    if (!databasePort) throw new Error(`Could not determine disposable PostgreSQL port: ${portOutput}`);
    databaseUrl = `postgresql://bora_test:${postgresPassword}@127.0.0.1:${databasePort}/bora_test`;
    await waitForDatabase(databaseUrl);
    await runNode('server/migrate.mjs', { DATABASE_URL: databaseUrl });
    databasePool = new Pool({ connectionString: databaseUrl, max: 4 });
    api = await startApi();
    apiBase = api.base;
  }, 240_000);

  beforeEach(async () => {
    await resetData();
  });

  afterAll(async () => {
    await api?.stop().catch(() => undefined);
    await databasePool?.end().catch(() => undefined);
    await execFileAsync('docker', ['rm', '--force', containerName], { timeout: 20_000 }).catch(() => undefined);
  }, 30_000);

  it('enforces transport contracts for CORS, security headers, JSON size, and strict paths', async () => {
    const health = await request('/health', { headers: { origin: corsOrigin } });
    expect(health.status).toBe(200);
    expect(health.headers.get('access-control-allow-origin')).toBe(corsOrigin);
    expect(health.headers.get('vary')).toContain('origin');
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    expect(health.headers.get('referrer-policy')).toBe('no-referrer');

    const preflight = await request('/events', { method: 'OPTIONS', headers: { origin: corsOrigin } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH');

    const malformed = await request('/recover', {
      method: 'POST', rawBody: '{', headers: { 'content-type': 'application/json' }
    });
    expect(malformed.status).toBe(400);
    expect(await json(malformed)).toEqual({ error: 'JSON inválido.' });

    const oversized = await request('/recover', {
      method: 'POST', rawBody: `{"recoveryToken":"${'x'.repeat(270_000)}"}`,
      headers: { 'content-type': 'application/json' }
    });
    expect(oversized.status).toBe(413);

    expect((await request('/events/not-a-route/extra')).status).toBe(404);
    expect((await request('/events/%')).status).toBe(400);
  });

  it('runs create/get/vote/close and delete races transactionally over HTTP', async () => {
    const created = await createEvent('participant_creator');
    expect(created.event.revision).toBe(0);
    const initial = await request(`/events/${created.event.slug}`, { participantId: 'participant_creator' });
    const initialBody = await json(initial);
    expect(initialBody).toMatchObject({
      voteSummary: { total: 1, responses: { accept: 1, maybe: 0, decline: 0 }, optionCounts: {} },
      votePage: { returned: 1, hasMore: false }
    });
    expect(initialBody.votes[0].isOwn).toBe(true);

    const firstVote = await request(`/events/${created.event.slug}/votes`, {
      method: 'POST', body: voteBody('participant_guest_1', 'Bia')
    });
    expect(firstVote.status).toBe(200);

    const closeBody = { ...initialBody.event, votingClosed: true, revision: 0 };
    const [closed, racingVote] = await Promise.all([
      request(`/events/${created.event.slug}`, {
        method: 'PATCH', adminToken: created.adminToken, body: closeBody
      }),
      request(`/events/${created.event.slug}/votes`, {
        method: 'POST', body: voteBody('participant_guest_2', 'Caio')
      })
    ]);
    expect(closed.status).toBe(200);
    expect([200, 409]).toContain(racingVote.status);
    const afterClose = await json(await request(`/events/${created.event.slug}`));
    expect(afterClose.event.votingClosed).toBe(true);
    expect(afterClose.voteSummary.total).toBe(racingVote.status === 200 ? 3 : 2);

    const doomed = await createEvent('participant_delete_creator', { title: 'Evento concorrente' });
    const [deleted, deleteRaceVote] = await Promise.all([
      request(`/events/${doomed.event.slug}`, { method: 'DELETE', adminToken: doomed.adminToken }),
      request(`/events/${doomed.event.slug}/votes`, {
        method: 'POST', body: voteBody('participant_delete_guest', 'Dani')
      })
    ]);
    expect(deleted.status).toBe(204);
    expect([200, 404]).toContain(deleteRaceVote.status);
    expect((await request(`/events/${doomed.event.slug}`)).status).toBe(404);
  });

  it('pages large vote sets with exact aggregates and an immutable tie-broken cursor', async () => {
    await databasePool.query(`insert into events
      (id, slug, admin_token_hash, mode, title, place, threshold, starts_at,
       alternatives, days, created_by_name, created_by_participant_id, reminder_starts_at)
      values ('evt_large', 'large-event', 'hash', 'mais-tarde', 'Evento grande', 'Centro', 999,
              '2099-08-03T21:00:00Z', '["2099-08-03T22:00:00.000Z"]', '[]', 'Ana', 'participant_creator', null)`);
    await databasePool.query(`insert into votes
      (id, event_id, participant_id, voter_name, response, preferred_options, availability, created_at, updated_at)
      select 'vote_' || lpad(number::text, 4, '0'), 'evt_large',
             'participant_' || number, 'Pessoa ' || number,
             case number % 3 when 0 then 'accept' when 1 then 'maybe' else 'decline' end,
             case when number % 3 = 2 then '[]'::jsonb else '["2099-08-03T22:00:00.000Z"]'::jsonb end,
             '{}'::jsonb,
             '2099-01-01T00:00:00Z'::timestamptz + number * interval '1 microsecond',
             '2099-01-01T00:00:00Z'::timestamptz + number * interval '1 microsecond'
      from generate_series(1, 2010) as number`);

    const firstResponse = await request('/events/large-event?votesLimit=200', { participantId: 'participant_1' });
    expect(firstResponse.status).toBe(200);
    const first = await json(firstResponse);
    expect(first.voteSummary).toEqual({
      total: 2010,
      responses: { accept: 670, maybe: 670, decline: 670 },
      optionCounts: { '2099-08-03T22:00:00.000Z': 1340 }
    });
    expect(first.ownVote).toMatchObject({ id: 'vote_0001', isOwn: true, voterName: 'Pessoa 1' });
    expect(first.votes).toHaveLength(200);
    expect(first.votePage).toMatchObject({ limit: 200, returned: 200, hasMore: true });

    await databasePool.query("update votes set updated_at = now() where id = 'vote_0001'");
    await databasePool.query(`insert into votes
      (id, event_id, participant_id, voter_name, response, preferred_options, availability, created_at, updated_at)
      values ('vote_9999', 'evt_large', 'participant_new', 'Nova pessoa', 'accept', '[]', '{}',
              '2100-01-01T00:00:00Z', now())`);

    const ids = first.votes.map(({ id }) => id);
    let cursor = first.votePage.nextCursor;
    while (cursor) {
      const pageResponse = await request(`/events/large-event?votesLimit=200&includeVoteSummary=0&votesCursor=${encodeURIComponent(cursor)}`);
      expect(pageResponse.status).toBe(200);
      const page = await json(pageResponse);
      expect(page.voteSummary).toBeUndefined();
      ids.push(...page.votes.map(({ id }) => id));
      cursor = page.votePage.nextCursor;
    }
    expect(ids).toHaveLength(2010);
    expect(new Set(ids).size).toBe(2010);
    expect(ids).not.toContain('vote_9999');
    expect(ids).toContain('vote_0001');

    expect((await request('/events/large-event?votesLimit=501')).status).toBe(400);
    expect((await request('/events/large-event?votesCursor=not-json')).status).toBe(400);
    expect((await request(`/events/large-event?votesCursor=${'a'.repeat(501)}`)).status).toBe(400);
    expect((await request('/events/large-event?includeVoteSummary=yes')).status).toBe(400);

    await databasePool.query(`insert into events
      (id, slug, admin_token_hash, mode, title, place, threshold, starts_at,
       alternatives, days, event_timezone, created_by_name, created_by_participant_id)
      values ('evt_slots', 'slot-event', 'hash', 'marcar', 'Horários', 'Centro', 2, null, '[]',
              '[{"id":"day_1","label":"segunda","date":"2099-08-03","slots":["18:00","19:00"]}]',
              'UTC', 'Ana', 'slot_creator')`);
    await databasePool.query(`insert into votes
      (id, event_id, participant_id, voter_name, response, preferred_options, availability)
      values ('slot_vote_1', 'evt_slots', 'slot_1', 'Um', 'accept', '[]', '{"day_1":["18:00","19:00"]}'),
             ('slot_vote_2', 'evt_slots', 'slot_2', 'Dois', 'accept', '[]', '{"day_1":["18:00"]}'),
             ('slot_vote_3', 'evt_slots', 'slot_3', 'Três', 'maybe', '[]', '{"day_1":["18:00"]}')`);
    const slotSummary = await json(await request('/events/slot-event?votesLimit=1'));
    expect(slotSummary.voteSummary.optionCounts).toEqual({ 'day_1:18:00': 3, 'day_1:19:00': 1 });
  });

  it('returns zero, one, and 100 organizer summaries without per-event reads', async () => {
    const participantId = 'participant_history';
    const empty = await json(await request('/me/events', { participantId }));
    expect(empty).toEqual({ created: [], joined: [] });

    await databasePool.query(`insert into events
      (id, slug, admin_token_hash, mode, title, place, threshold, starts_at,
       alternatives, days, created_by_name, created_by_participant_id, reminder_starts_at)
      select 'evt_history_' || lpad(number::text, 3, '0'),
             'history-' || lpad(number::text, 3, '0'), 'hash', 'agora', 'Evento ' || number,
             'Centro', 2, '2099-08-03T21:00:00Z', '[]', '[]', 'Ana', $1,
             '2099-08-03T21:00:00Z'
      from generate_series(1, 1) as number`, [participantId]);
    await databasePool.query(`insert into votes
      (id, event_id, participant_id, voter_name, response, preferred_options, availability)
      values ('vote_history_001_creator', 'evt_history_001', $1, 'Ana', 'accept', '[]', '{}'),
             ('vote_history_001_guest', 'evt_history_001', 'guest_001', 'Bia', 'accept', '[]', '{}')`, [participantId]);
    const one = await json(await request('/me/events', { participantId }));
    expect(one.created).toHaveLength(1);
    expect(one.created[0]).toMatchObject({ confirmedCount: 2, participantResponse: 'accept' });

    await databasePool.query(`insert into events
      (id, slug, admin_token_hash, mode, title, place, threshold, starts_at,
       alternatives, days, created_by_name, created_by_participant_id, reminder_starts_at)
      select 'evt_history_' || lpad(number::text, 3, '0'),
             'history-' || lpad(number::text, 3, '0'), 'hash', 'agora', 'Evento ' || number,
             'Centro', 2, '2099-08-03T21:00:00Z', '[]', '[]', 'Ana', $1,
             '2099-08-03T21:00:00Z'
      from generate_series(2, 100) as number`, [participantId]);
    await databasePool.query(`insert into votes
      (id, event_id, participant_id, voter_name, response, preferred_options, availability)
      select 'vote_history_' || lpad(number::text, 3, '0') || '_' || role.name,
             'evt_history_' || lpad(number::text, 3, '0'),
             case role.name when 'creator' then $1 else 'guest_' || number end,
             case role.name when 'creator' then 'Ana' else 'Convidado' end,
             'accept', '[]'::jsonb, '{}'::jsonb
      from generate_series(2, 100) as number
      cross join (values ('creator'), ('guest')) as role(name)`, [participantId]);
    const maximum = await json(await request('/me/events', { participantId }));
    expect(maximum.created).toHaveLength(100);
    expect(maximum.created.every((event) => event.confirmedCount === 2 && event.participantResponse === 'accept')).toBe(true);

    await databasePool.query(`insert into events
      (id, slug, admin_token_hash, mode, title, place, threshold, starts_at,
       alternatives, days, created_by_name, created_by_participant_id, reminder_starts_at)
      values ('evt_joined', 'joined-event', 'hash', 'agora', 'Convidado', 'Centro', 2,
              '2099-08-03T21:00:00Z', '[]', '[]', 'Outra pessoa', 'other_creator', '2099-08-03T21:00:00Z')`);
    await databasePool.query(`insert into votes
      (id, event_id, participant_id, voter_name, response, preferred_options, availability)
      values ('vote_joined_own', 'evt_joined', $1, 'Ana', 'maybe', '[]', '{}'),
             ('vote_joined_accept', 'evt_joined', 'other_creator', 'Outra pessoa', 'accept', '[]', '{}')`, [participantId]);
    const joined = await json(await request('/me/events', { participantId }));
    expect(joined.joined).toHaveLength(1);
    expect(joined.joined[0]).toMatchObject({ confirmedCount: 1, participantResponse: 'maybe' });
  });

  it('rotates recovery tokens atomically and rebinds Push state without leaking the old identity', async () => {
    const participantId = 'participant_recovery';
    const firstLink = await json(await request('/me/recovery-link', { method: 'POST', participantId }));
    expect((await request('/recover', { method: 'POST', body: firstLink })).status).toBe(200);
    const replacement = await json(await request('/me/recovery-link', { method: 'POST', participantId }));
    expect((await request('/recover', { method: 'POST', body: firstLink })).status).toBe(404);
    expect(await json(await request('/recover', { method: 'POST', body: replacement })))
      .toEqual({ participantId });
    expect((await request('/recover', { method: 'POST', body: { recoveryToken: 'rec_invalid' } })).status).toBe(404);

    const rotations = await Promise.all([
      request('/me/recovery-link', { method: 'POST', participantId }),
      request('/me/recovery-link', { method: 'POST', participantId })
    ]);
    const rotationTokens = await Promise.all(rotations.map(json));
    const recoveryStatuses = await Promise.all(rotationTokens.map((token) =>
      request('/recover', { method: 'POST', body: token }).then((response) => response.status)
    ));
    expect(recoveryStatuses.sort()).toEqual([200, 404]);
    const tokenRows = await databasePool.query('select count(*)::int as count from participant_recovery_tokens where participant_id = $1', [participantId]);
    expect(tokenRows.rows[0].count).toBe(1);

    const endpoint = 'https://push.example.test/send/device-1';
    const subscription = { endpoint, keys: { p256dh: 'public-key-old', auth: 'auth-old' } };
    expect((await request('/push/subscriptions', {
      method: 'POST', participantId: 'participant_stale', body: subscription
    })).status).toBe(201);
    expect((await request('/push/subscriptions/preferences', {
      method: 'PUT', participantId: 'participant_stale',
      body: { endpoint, preferences: { votes: false, changes: true, confirmed: false, threshold: true, upcoming: false } }
    })).status).toBe(200);

    expect((await request('/push/subscriptions', {
      method: 'POST', participantId,
      body: { endpoint, keys: { p256dh: 'public-key-new', auth: 'auth-new' } }
    })).status).toBe(201);
    const endpointQuery = `?endpoint=${encodeURIComponent(endpoint)}`;
    expect(await json(await request(`/push/subscriptions/preferences${endpointQuery}`, { participantId: 'participant_stale' })))
      .toEqual({ subscribed: false, preferences: {} });
    expect(await json(await request(`/push/subscriptions/preferences${endpointQuery}`, { participantId })))
      .toEqual({
        subscribed: true,
        preferences: { votes: false, changes: true, confirmed: false, threshold: true, upcoming: false, messages: false }
      });
    const binding = await databasePool.query('select participant_id, p256dh, auth from push_subscriptions where endpoint = $1', [endpoint]);
    expect(binding.rows).toEqual([{ participant_id: participantId, p256dh: 'public-key-new', auth: 'auth-new' }]);

    expect((await request('/push/subscriptions', { method: 'DELETE', participantId, body: { endpoint } })).status).toBe(204);
    expect(await json(await request(`/push/subscriptions/preferences${endpointQuery}`, { participantId })))
      .toEqual({ subscribed: false, preferences: {} });
  });

  it('persists resolved reminder instants and installs the incremental indexes', async () => {
    const created = await createEvent('participant_reminder', { startsAt: '2099-12-03T21:00:00.000Z' });
    const stored = await databasePool.query('select starts_at, reminder_starts_at from events where id = $1', [created.event.id]);
    expect(stored.rows[0].reminder_starts_at.toISOString()).toBe(stored.rows[0].starts_at.toISOString());

    const later = await createEvent('participant_later_reminder', {
      mode: 'mais-tarde', title: 'Escolher horário', startsAt: '2099-12-04T21:00:00.000Z',
      alternatives: ['2099-12-04T23:00:00.000Z']
    });
    const beforeDecision = await databasePool.query('select reminder_starts_at from events where id = $1', [later.event.id]);
    expect(beforeDecision.rows[0].reminder_starts_at).toBeNull();
    const decided = await request(`/events/${later.event.slug}`, {
      method: 'PATCH', adminToken: later.adminToken,
      body: { ...later.event, decidedOption: '2099-12-04T23:00:00.000Z', votingClosed: true, revision: 0 }
    });
    expect(decided.status).toBe(200);
    const selected = await databasePool.query('select reminder_starts_at from events where id = $1', [later.event.id]);
    expect(selected.rows[0].reminder_starts_at.toISOString()).toBe('2099-12-04T23:00:00.000Z');

    const indexes = await databasePool.query(`select indexname from pg_indexes
      where tablename in ('events', 'votes') and indexname in ('events_reminder_starts_at_idx', 'votes_event_created_id_idx')
      order by indexname`);
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      'events_reminder_starts_at_idx', 'votes_event_created_id_idx'
    ]);
    const migration = await databasePool.query("select 1 from schema_migrations where name = '011_incremental_reminders.sql'");
    expect(migration.rowCount).toBe(1);
  });

  it('treats query-string event creation as rate-limited and ignores spoofed forwarding headers', async () => {
    const isolatedApi = await startApi();
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await request('/events?campaign=integration', {
          base: isolatedApi.base, method: 'POST', body: {},
          headers: { 'x-forwarded-for': `198.51.100.${attempt + 1}` }
        });
        expect(response.status).toBe(400);
      }
      const limited = await request('/events?campaign=integration', {
        base: isolatedApi.base, method: 'POST', body: {},
        headers: { 'x-forwarded-for': '203.0.113.250' }
      });
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    } finally {
      await isolatedApi.stop();
    }
  });
});
