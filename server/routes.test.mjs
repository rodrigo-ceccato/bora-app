import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { pool } from './db.mjs';
import { route } from './index.mjs';

const originalConnect = pool.connect;

afterEach(() => {
  pool.connect = originalConnect;
});

function adminHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function request(method, url, token, body, participantId) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(stream, {
    method,
    url,
    headers: { authorization: `Bearer ${token}`, ...(participantId ? { 'x-participant-id': participantId } : {}) },
    socket: { remoteAddress: '127.0.0.1' }
  });
}

function response() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status; },
    end(body = '') { this.body = String(body || ''); }
  };
}

describe('transactional event mutations', () => {
  it('keeps an idle database client error from becoming an unhandled EventEmitter error', () => {
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
  });

  it('locks and deletes the event in one transaction before returning success', async () => {
    const queries = [];
    const client = {
      async query(query) {
        const sql = typeof query === 'string' ? query : query.text;
        queries.push(sql);
        if (sql.includes('select * from events')) {
          return { rows: [{
            id: 'evt_1', slug: 'cinema', mode: 'agora', title: 'Cinema', place: 'Centro',
            starts_at: new Date('2099-08-03T21:00:00.000Z'), days: [],
            admin_token_hash: adminHash('secret')
          }] };
        }
        return { rows: [], rowCount: 1 };
      },
      release() {}
    };
    pool.connect = async () => client;
    const output = response();

    await route(request('DELETE', '/api/events/cinema', 'secret'), output);

    expect(output.status).toBe(204);
    expect(queries).toEqual([
      'begin',
      'select * from events where slug = $1 for update',
      'delete from events where id = $1',
      'commit'
    ]);
  });

  it('checks the revision, attributes activity to the active administrator, and supports legacy events', async () => {
    const queries = [];
    const current = {
      id: 'evt_1', slug: 'cinema', mode: 'mais-tarde', title: 'Cinema', place: 'Centro', description: '',
      threshold: 2, starts_at: new Date('2099-08-03T21:00:00.000Z'),
      alternatives: ['2099-08-03T22:00:00.000Z'], days: [], event_timezone: 'UTC',
      created_by_name: 'Ana', created_by_participant_id: 'participant_ana', notify_creator_on_vote: true,
      voting_closed: false, revision: 4, admin_token_hash: adminHash('secret'), created_at: new Date()
    };
    const client = {
      async query(query, values = []) {
        const sql = typeof query === 'string' ? query : query.text;
        queries.push({ sql, values });
        if (sql.includes('select * from events')) return { rows: [current] };
        if (sql.includes('update events set')) return { rows: [{ ...current, alternatives: JSON.parse(values[5]), revision: 5 }] };
        return { rows: [], rowCount: 1 };
      },
      release() {}
    };
    pool.connect = async () => client;
    const output = response();
    const event = {
      mode: 'mais-tarde', title: 'Cinema', place: 'Centro', description: '', threshold: 2,
      startsAt: '2099-08-03T21:00:00.000Z',
      alternatives: ['2099-08-03T22:00:00.000Z', '2099-08-03T23:00:00.000Z'],
      days: [], createdByName: 'Ana', votingClosed: false, revision: 4
    };

    await route(request('PATCH', '/api/events/cinema', 'secret', event, 'participant_bia'), output);

    expect(output.status).toBe(200);
    const eventUpdate = queries.find(({ sql }) => sql.includes('update events set'));
    expect(eventUpdate.sql).toContain('where id=$13 and revision=$14');
    expect(eventUpdate.values.at(-1)).toBe(4);
    expect(eventUpdate.values[11]).toBeNull();
    const creatorUpdate = queries.find(({ sql }) => sql.includes("update votes set response='accept'"));
    expect(JSON.parse(creatorUpdate.values[0])).toEqual([
      '2099-08-03T21:00:00.000Z', '2099-08-03T22:00:00.000Z', '2099-08-03T23:00:00.000Z'
    ]);
    const guestCleanup = queries.find(({ sql }) => sql.includes('update votes as vote set'));
    expect(JSON.parse(guestCleanup.values[0])).toEqual({
      '2099-08-03T21:00:00.000Z': true,
      '2099-08-03T22:00:00.000Z': true
    });
    const activityInsert = queries.find(({ sql }) => sql.includes('insert into event_activities'));
    expect(activityInsert.values.slice(1)).toEqual(['evt_1', 'event_changed', 'participant_bia', 'participant_bia']);

    current.created_by_participant_id = null;
    const legacyOutput = response();
    await route(request('PATCH', '/api/events/cinema', 'secret', event), legacyOutput);
    expect(legacyOutput.status).toBe(200);
    const activityInserts = queries.filter(({ sql }) => sql.includes('insert into event_activities'));
    expect(activityInserts.at(-1).values.slice(1)).toEqual(['evt_1', 'event_changed', 'system', 'system']);
    expect(queries.map(({ sql }) => sql)).toEqual(expect.arrayContaining(['begin', 'commit']));
  });
});
