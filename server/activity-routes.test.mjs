import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pool } from './db.mjs';
import { route } from './index.mjs';

const originalQuery = pool.query;
const state = new Map();
const activityQueries = [];
const activityRow = {
  id: 'activity_1', event_id: 'evt_1', kind: 'message', slug: 'cinema', title: 'Cinema',
  actor_participant_id: 'participant_bia', updated_at: new Date('2026-08-18T15:00:00Z')
};

function request(method, url, participantId, body) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(stream, { method, url, headers: { 'x-participant-id': participantId }, socket: { remoteAddress: '127.0.0.1' } });
}

function response() {
  return { status: 0, body: '', writeHead(status) { this.status = status; }, end(body = '') { this.body = String(body || ''); } };
}

async function call(method, url, participantId, body) {
  const output = response();
  await route(request(method, url, participantId, body), output);
  return { status: output.status, body: output.body ? JSON.parse(output.body) : undefined };
}

beforeEach(() => {
  state.clear();
  activityQueries.length = 0;
  pool.query = async (query, values = []) => {
    const sql = typeof query === 'string' ? query : query.text;
    if (sql.includes('insert into participant_activity_state')) {
      const action = sql.includes('read_at') ? 'read' : 'dismiss';
      for (const key of values[1]) state.set(`${values[0]}:${key}`, action);
      return { rows: [], rowCount: values[1].length };
    }
    if (sql.includes('from event_activities activity')) {
      activityQueries.push({ sql, values });
      const participantId = values[0];
      const hidden = state.has(`${participantId}:activity:activity_1`);
      return { rows: participantId === 'participant_ana' && !hidden ? [activityRow] : [], rowCount: hidden ? 0 : 1 };
    }
    if (sql.includes('from events') && sql.includes('reminder_starts_at')) {
      return values[0] === 'participant_upcoming' ? { rows: [{
        event_id: 'evt_upcoming', slug: 'jantar', title: 'Jantar',
        reminder_starts_at: new Date('2099-08-20T20:00:00Z'), activity_key: 'upcoming:evt_upcoming:1'
      }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
});

afterEach(() => { pool.query = originalQuery; });

describe('participant activity state', () => {
  it('keeps a dismissal across devices sharing the participant identity', async () => {
    expect((await call('GET', '/api/me/activity', 'participant_ana')).body.items).toHaveLength(1);
    await call('PUT', '/api/me/activity-state', 'participant_ana', { activityKeys: ['activity:activity_1'], action: 'dismiss' });
    expect((await call('GET', '/api/me/activity', 'participant_ana')).body.items).toEqual([]);
  });

  it('keeps read activity from becoming unread after reload', async () => {
    await call('PUT', '/api/me/activity-state', 'participant_ana', { activityKeys: ['activity:activity_1'], action: 'read' });
    expect((await call('GET', '/api/me/activity', 'participant_ana')).body.items).toEqual([]);
    expect(state.get('participant_ana:activity:activity_1')).toBe('read');
  });

  it('keeps an upcoming Bora visible after it is read', async () => {
    await call('PUT', '/api/me/activity-state', 'participant_upcoming', {
      activityKeys: ['upcoming:evt_upcoming:1'], action: 'read'
    });
    const feed = (await call('GET', '/api/me/activity', 'participant_upcoming')).body;
    expect(feed.items).toEqual([expect.objectContaining({ slug: 'jantar', startsAt: '2099-08-20T20:00:00.000Z' })]);
  });

  it('never returns another participant activity', async () => {
    expect((await call('GET', '/api/me/activity', 'participant_carla')).body.items).toEqual([]);
  });

  it('caps event groups only after selecting all eligible activity', async () => {
    await call('GET', '/api/me/activity', 'participant_ana');
    expect(activityQueries[0].sql).toContain('group by event_id');
    expect(activityQueries[0].sql).toContain('join selected_events');
    expect(activityQueries[0].values).toEqual(['participant_ana', 4]);
  });

  it('supports an uncapped request for the complete activity view', async () => {
    await call('GET', '/api/me/activity?all=true', 'participant_ana');
    expect(activityQueries[0].values).toEqual(['participant_ana', null]);
  });
});
