import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDeviceAuthentication,
  collectEventVotePages,
  createEvent,
  getEvent,
  getParticipantId,
  getParticipantName,
  hasRegisteredParticipant,
  listAdminEvents,
  listMyEvents,
  restoreAdminEvents,
  restoreParticipantId,
  saveSessionPreference,
  updateEvent
} from './store';
import { availabilityResults } from './results';

class FakeStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  failRemovals = false;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) {
    if (this.failRemovals) throw new DOMException('Storage is unavailable', 'SecurityError');
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('Storage is full', 'QuotaExceededError');
    this.values.set(key, String(value));
  }
}

let local: FakeStorage;
let session: FakeStorage;

beforeEach(() => {
  local = new FakeStorage();
  session = new FakeStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  clearDeviceAuthentication();
});

describe('resilient browser storage', () => {
  it('ignores corrupt durable JSON and uses a valid session fallback', () => {
    local.setItem('bora_admin_events', '{not-json');
    session.setItem('bora_admin_events', JSON.stringify([
      { slug: 'evento', title: 'Evento', adminToken: 'adm_secret' }
    ]));

    expect(listAdminEvents()).toEqual([
      { slug: 'evento', title: 'Evento', adminToken: 'adm_secret' }
    ]);
  });

  it('does not let a semantically corrupt durable array hide a valid fallback', () => {
    local.setItem('bora_admin_events', JSON.stringify([{ unexpected: true }]));
    session.setItem('bora_admin_events', JSON.stringify([
      { slug: 'fallback', title: 'Fallback', adminToken: 'adm_fallback' }
    ]));

    expect(listAdminEvents()).toMatchObject([{ slug: 'fallback', adminToken: 'adm_fallback' }]);
  });

  it('prefers a newer session fallback over valid but stale quota-blocked durable data', async () => {
    local.setItem('bora_admin_events', JSON.stringify([
      { slug: 'old', title: 'Antigo', adminToken: 'adm_old' }
    ]));
    local.setItem('bora_events_v2', JSON.stringify([{
      event: {
        id: 'evt_old', slug: 'old', mode: 'agora', title: 'Antigo', place: 'Centro', threshold: 1,
        startsAt: '2099-08-01T18:00:00.000Z', alternatives: [], days: [], votingClosed: false,
        createdAt: '2099-01-01T00:00:00.000Z'
      },
      votes: [], isAdmin: true
    }]));
    local.failWrites = true;
    local.failRemovals = true;

    restoreAdminEvents([{ slug: 'new', title: 'Novo', adminToken: 'adm_new' }]);
    await createEvent({
      mode: 'agora', title: 'Novo evento', place: 'Centro', threshold: 1,
      startsAt: '2099-08-02T18:00:00.000Z', alternatives: [], days: [], createdByName: 'Ana'
    });

    expect(listAdminEvents().map(({ slug }) => slug)).toEqual(expect.arrayContaining(['new', 'old']));
    expect((await listMyEvents()).created.map(({ slug }) => slug))
      .toEqual(expect.arrayContaining(['old', expect.stringMatching(/^novo-evento-/)]));
  });

  it('filters malformed organizer capabilities instead of crashing', () => {
    local.setItem('bora_admin_events', JSON.stringify([
      null,
      { slug: '', title: 'Sem slug', adminToken: 'adm_1' },
      { slug: 'ok', title: 'Válido', adminToken: 'adm_2' },
      { slug: 'missing-token', title: 'Inválido' }
    ]));

    expect(listAdminEvents()).toEqual([
      { slug: 'ok', title: 'Válido', adminToken: 'adm_2' }
    ]);
  });

  it('filters corrupt stored votes before normalizing legacy preferences', async () => {
    local.setItem('bora_events_v2', JSON.stringify([{
      event: {
        id: 'evt_1', slug: 'cinema', mode: 'agora', title: 'Cinema', place: 'Centro',
        threshold: 2, startsAt: new Date(Date.now() + 60_000).toISOString(), alternatives: [], days: [],
        votingClosed: false, createdAt: new Date().toISOString()
      },
      votes: [null, 'corrupt', { id: 'vote_1', eventId: 'evt_1', participantId: 'participant_1', voterName: 'Ana', response: 'accept', preferredOptions: [], availability: {}, createdAt: new Date().toISOString() }],
      isAdmin: true
    }]));
    restoreParticipantId('participant_1');

    const result = await listMyEvents();
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ confirmedCount: 1, participantResponse: 'accept' });
  });

  it('rejects parseable partial votes and malformed events without crashing schedule results', async () => {
    local.setItem('bora_events_v2', JSON.stringify([
      {
        event: {
          id: 'evt_partial', slug: 'partial', mode: 'marcar', title: 'Agenda', place: 'Centro',
          threshold: 2, alternatives: [],
          days: [{ id: 'day_1', label: 'sexta', date: '2099-08-01', slots: ['18:00'] }],
          votingClosed: false, createdAt: '2099-01-01T00:00:00.000Z'
        },
        votes: [
          { id: 'partial-only' },
          {
            id: 'vote_valid', eventId: 'evt_partial', voterName: 'Ana', response: 'maybe',
            preferredOptions: [], availability: { day_1: ['18:00'] }, createdAt: '2099-01-01T00:00:00.000Z'
          }
        ],
        isAdmin: true
      },
      { event: { id: 'broken' }, votes: [] },
      {
        event: {
          id: 'wrong_optional', slug: 'wrong-optional', mode: 'marcar', title: 'Inválido', place: 'Centro',
          threshold: 1, alternatives: [], days: [{ id: 'day_x', label: 'dia', date: '2099-08-02', slots: ['18:00'] }],
          votingClosed: false, decidedOption: { unsafe: true }, description: { unsafe: true },
          createdAt: '2099-01-01T00:00:00.000Z'
        },
        votes: [], isAdmin: false
      }
    ]));

    const result = await listMyEvents();
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ id: 'evt_partial', participantResponse: undefined });
    expect(result.created[0].confirmedCount).toBe(0);
    const stored = await getEvent('partial');
    expect(stored?.votes).toHaveLength(1);
    expect(availabilityResults(stored!.event, stored!.votes)[0]).toMatchObject({ count: 1, names: ['Ana'] });
    const sanitized = await getEvent('wrong-optional');
    expect(sanitized?.event).not.toHaveProperty('decidedOption');
    expect(sanitized?.event).not.toHaveProperty('description');
  });

  it('ignores oversized stored identities and caps corrupt stored names', () => {
    local.setItem('bora_participant_id', 'x'.repeat(101));
    session.setItem('bora_participant_id', ' participant_fallback ');
    local.setItem('bora_participant_name', `  ${'N'.repeat(100)}  `);

    expect(getParticipantId()).toBe('participant_fallback');
    expect(hasRegisteredParticipant()).toBe(true);
    expect(getParticipantName()).toBe('N'.repeat(80));
    expect(() => restoreParticipantId(' ')).toThrow('inválida');
  });

  it('falls back to session storage when durable storage rejects writes', () => {
    local.failWrites = true;

    expect(restoreParticipantId('participant_restored')).toBe('session');
    expect(getParticipantId()).toBe('participant_restored');
    expect(session.getItem('bora_participant_id')).toBe('participant_restored');
  });

  it('treats denied session-only preferences as non-fatal', () => {
    session.failWrites = true;
    expect(saveSessionPreference('optional-ui-state', '{"open":true}')).toBe(false);
    expect(session.getItem('optional-ui-state')).toBeNull();
  });

  it('keeps identity usable in memory when browser storage is unavailable', () => {
    local.failWrites = true;
    session.failWrites = true;

    expect(restoreParticipantId('participant_memory')).toBe('memory');
    expect(getParticipantId()).toBe('participant_memory');
    clearDeviceAuthentication();
    expect(hasRegisteredParticipant()).toBe(false);
  });

  it('does not falsely claim a device is cleared when readable local capabilities cannot be removed', () => {
    local.setItem('bora_participant_id', 'participant_stale');
    local.setItem('bora_admin_events', JSON.stringify([{ slug: 'stale', title: 'Antigo', adminToken: 'adm_stale' }]));
    local.failRemovals = true;

    const cleared = clearDeviceAuthentication();
    expect(cleared.complete).toBe(false);
    expect(cleared.participant).toBe(false);
    // The raw browser value is still there, but it cannot silently regain
    // bearer-capability status during this session.
    expect(local.getItem('bora_participant_id')).toBe('participant_stale');
    expect(hasRegisteredParticipant()).toBe(false);
    expect(listAdminEvents()).toEqual([]);

    local.failRemovals = false;
    expect(clearDeviceAuthentication().complete).toBe(true);
    expect(local.getItem('bora_participant_id')).toBeNull();
  });

  it('reports temporary organizer persistence without losing an offline creation', async () => {
    local.failWrites = true;

    const event = await createEvent({
      mode: 'agora',
      title: 'Cinema',
      place: 'Centro',
      threshold: 2,
      startsAt: new Date(Date.now() + 60_000).toISOString(),
      alternatives: [],
      days: [],
      createdByName: 'Ana'
    });

    expect(event.adminToken).toBeTruthy();
    expect(event.adminAccessPersistence).toBe('session');
    expect((await listMyEvents()).created).toHaveLength(1);
    expect(listAdminEvents()).toMatchObject([{ slug: event.slug, adminToken: event.adminToken }]);
  });

  it('rejects a stale local organizer update instead of silently overwriting it', async () => {
    const event = await createEvent({
      mode: 'agora', title: 'Original', place: 'Centro', threshold: 2,
      startsAt: new Date(Date.now() + 60_000).toISOString(), alternatives: [], days: [], createdByName: 'Ana'
    });
    const first = await updateEvent(event.adminToken!, { ...event, title: 'Primeira edição' });
    expect(first.revision).toBe(1);

    await expect(updateEvent(event.adminToken!, { ...event, title: 'Edição desatualizada' }))
      .rejects.toThrow('alterado em outra tela');
    expect((await listMyEvents()).created[0].title).toBe('Primeira edição');
  });

  it('merges only valid recovered organizer capabilities', () => {
    restoreAdminEvents([
      { slug: 'first', title: 'Primeiro', adminToken: 'adm_first' },
      { slug: '', title: 'Inválido', adminToken: 'adm_invalid' }
    ]);
    restoreAdminEvents([{ slug: 'second', title: 'Segundo', adminToken: 'adm_second' }]);

    expect(listAdminEvents().map(({ slug }) => slug)).toEqual(['second', 'first']);
  });

  it('does not evict the oldest organizer capability after the 30th saved event', () => {
    const controls = Array.from({ length: 31 }, (_, index) => ({
      slug: `evento-${index}`, title: `Evento ${index}`, adminToken: `adm_${index}`
    }));
    restoreAdminEvents(controls);
    expect(listAdminEvents()).toHaveLength(31);
    expect(listAdminEvents().at(-1)).toMatchObject({ slug: 'evento-30', adminToken: 'adm_30' });
  });
});

describe('bounded event vote hydration', () => {
  it('stops at 2,000 names while preserving exact aggregate metadata', async () => {
    const event = {
      id: 'evt_large', slug: 'large-event', mode: 'agora' as const, title: 'Evento grande', place: 'Centro',
      threshold: 999, startsAt: '2099-08-03T21:00:00.000Z', alternatives: [], days: [],
      votingClosed: false, createdAt: '2026-08-10T00:00:00.000Z'
    };
    const makeVote = (number: number) => ({
      id: `vote_${number}`, eventId: event.id, voterName: `Pessoa ${number}`,
      response: 'accept' as const, preferredOptions: [], availability: {},
      createdAt: '2026-08-10T00:00:00.000Z'
    });
    const allVotes = Array.from({ length: 2500 }, (_, index) => makeVote(index));
    const requestedLimits: number[] = [];
    const result = await collectEventVotePages({
      event,
      votes: allVotes.slice(0, 200),
      ownVote: { ...allVotes[2499], isOwn: true },
      voteSummary: { total: 2500, responses: { accept: 2500, maybe: 0, decline: 0 }, optionCounts: {} },
      votePage: { limit: 200, returned: 200, hasMore: true, nextCursor: '200' }
    }, async (cursor, limit) => {
      requestedLimits.push(limit);
      const start = Number(cursor);
      const end = Math.min(allVotes.length, start + limit);
      return {
        event,
        votes: allVotes.slice(start, end),
        votePage: {
          limit,
          returned: end - start,
          hasMore: end < allVotes.length,
          ...(end < allVotes.length ? { nextCursor: String(end) } : {})
        }
      };
    });

    expect(result.votes).toHaveLength(2000);
    expect(new Set(result.votes.map(({ id }) => id)).size).toBe(2000);
    expect(result.votesTruncated).toBe(true);
    expect(result.voteSummary?.total).toBe(2500);
    expect(result.ownVote).toMatchObject({ id: 'vote_2499', isOwn: true });
    expect(result.votePage).toMatchObject({ returned: 2000, hasMore: true, nextCursor: '2000' });
    expect(requestedLimits).toEqual([500, 500, 500, 300]);
  });
});
