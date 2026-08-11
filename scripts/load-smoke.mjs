import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const rawBaseUrl = process.env.BORA_LOAD_BASE_URL;
if (!rawBaseUrl) {
  throw new Error('Set BORA_LOAD_BASE_URL explicitly (for example http://127.0.0.1:8080)');
}

const baseUrl = new URL(rawBaseUrl);
if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error('BORA_LOAD_BASE_URL must be an HTTP(S) origin without credentials');
}
baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/`;
const loopbackHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
const remoteAcknowledgement = 'I_UNDERSTAND_THIS_CREATES_AND_DELETES_DATA';
if (!loopbackHosts.has(baseUrl.hostname) && process.env.BORA_LOAD_ALLOW_REMOTE !== remoteAcknowledgement) {
  throw new Error(`Remote load smoke is disabled. Use an isolated pilot target and set BORA_LOAD_ALLOW_REMOTE=${remoteAcknowledgement}`);
}

function boundedInteger(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`);
  }
  return value;
}

const virtualUsers = boundedInteger('BORA_LOAD_CONCURRENCY', 6, 50);
const rounds = boundedInteger('BORA_LOAD_ROUNDS', 3, 20);
const eventCount = boundedInteger('BORA_LOAD_EVENTS', 2, 5);
const timeoutMs = boundedInteger('BORA_LOAD_TIMEOUT_MS', 5_000, 30_000);
const maximumErrorRate = Number(process.env.BORA_LOAD_MAX_ERROR_RATE || 0.01);
const maximumReadP95 = Number(process.env.BORA_LOAD_READ_P95_MS || 400);
const maximumWriteP95 = Number(process.env.BORA_LOAD_WRITE_P95_MS || 750);
if (![maximumErrorRate, maximumReadP95, maximumWriteP95].every(Number.isFinite)) {
  throw new Error('Load-smoke thresholds must be finite numbers');
}

const runId = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
const samples = [];
const createdEvents = [];

async function request(path, { method = 'GET', headers = {}, body, kind = 'read', expected = [200] } = {}) {
  const startedAt = performance.now();
  let status = 0;
  let responseText = '';
  try {
    const response = await globalThis.fetch(new URL(path.replace(/^\//, ''), baseUrl), {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: globalThis.AbortSignal.timeout(timeoutMs)
    });
    status = response.status;
    responseText = await response.text();
    if (!expected.includes(status)) {
      throw new Error(`${method} ${path} returned ${status}: ${responseText.slice(0, 160)}`);
    }
    return responseText ? JSON.parse(responseText) : null;
  } finally {
    samples.push({ kind, milliseconds: performance.now() - startedAt, failed: !expected.includes(status) });
  }
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

async function cleanup() {
  await Promise.allSettled(createdEvents.map(({ slug, adminToken }) => request(`/api/events/${slug}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${adminToken}` },
    kind: 'cleanup',
    expected: [204]
  })));
}

let failure;
try {
  await request('/api/health');
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
    const participantId = `load-creator-${runId}-${eventIndex}`;
    const created = await request('/api/events', {
      method: 'POST',
      kind: 'write',
      expected: [201],
      body: {
        participantId,
        event: {
          mode: 'agora',
          title: `Load smoke ${runId} ${eventIndex + 1}`,
          place: 'Ambiente de teste',
          description: 'Carga sintética descartável',
          threshold: virtualUsers + 1,
          startsAt,
          alternatives: [],
          days: [],
          createdByName: 'Carga',
          votingClosed: false
        }
      }
    });
    createdEvents.push({
      slug: created.event.slug,
      adminToken: created.adminToken,
      event: created.event
    });
  }

  for (let round = 0; round < rounds; round += 1) {
    const workloads = [];
    for (const target of createdEvents) {
      // The organizer write runs alongside voters, exercising row-lock and
      // database-pool contention without intentionally submitting stale edits.
      workloads.push(request(`/api/events/${target.slug}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${target.adminToken}`
        },
        kind: 'write',
        body: { ...target.event, description: `Carga sintética, rodada ${round + 1}` }
      }).then((result) => { target.event = result.event; }));

      for (let user = 0; user < virtualUsers; user += 1) {
        const participantId = `load-${runId}-${round}-${user}`;
        workloads.push((async () => {
          await request(`/api/events/${target.slug}/votes`, {
            method: 'POST',
            kind: 'write',
            body: {
              participantId,
              voterName: `Pessoa ${user + 1}`,
              response: user % 4 === 0 ? 'maybe' : 'accept',
              preferredOptions: [],
              availability: {}
            }
          });
          await Promise.all([
            request(`/api/events/${target.slug}?votesLimit=50`, {
              headers: { 'x-participant-id': participantId },
              kind: 'read'
            }),
            request('/api/presence', {
              method: 'POST',
              headers: { 'x-participant-id': participantId },
              kind: 'write',
              expected: [204]
            }),
            request('/api/me/events', {
              headers: { 'x-participant-id': participantId },
              kind: 'read'
            })
          ]);
        })());
      }
    }
    await Promise.all(workloads);
  }
} catch (error) {
  failure = error;
} finally {
  await cleanup();
}

if (failure) throw failure;

const measured = samples.filter(({ kind }) => kind !== 'cleanup');
const reads = measured.filter(({ kind }) => kind === 'read').map(({ milliseconds }) => milliseconds);
const writes = measured.filter(({ kind }) => kind === 'write').map(({ milliseconds }) => milliseconds);
const failures = measured.filter(({ failed }) => failed).length;
const errorRate = measured.length ? failures / measured.length : 1;
const readP95 = percentile(reads, 0.95);
const writeP95 = percentile(writes, 0.95);

process.stdout.write([
  `Load smoke target: ${baseUrl.origin}`,
  `Requests: ${measured.length}; failures: ${failures} (${(errorRate * 100).toFixed(2)}%)`,
  `Read p95: ${readP95.toFixed(1)} ms (limit ${maximumReadP95} ms)`,
  `Write p95: ${writeP95.toFixed(1)} ms (limit ${maximumWriteP95} ms)`
].join('\n') + '\n');

if (errorRate > maximumErrorRate || readP95 > maximumReadP95 || writeP95 > maximumWriteP95) {
  throw new Error('Load smoke exceeded its pilot error or latency threshold');
}
