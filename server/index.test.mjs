import { describe, expect, it } from 'vitest';
import {
  assertEventRevision,
  assertPatchMode,
  coarsenPresenceCount,
  createRateLimiter,
  creatorVoteSchedule,
  deletionNotificationPlan,
  dueReminderQuery,
  eventHasOccurred,
  eventStartAt,
  eventUpdateNotificationPlan,
  pushPreferencesResponse,
  pushSubscriptionQuery,
  retainedGuestSchedule,
  resolveClientAddress,
  reminderStartAt,
  reminderNotificationKind,
  runBoundedWork,
  scheduleEntryKeys,
  slugify,
  validateEvent,
  validateFutureSchedule,
  validateVote,
  votePageQuery,
  voteNotificationPlan,
  withUniqueSlug,
  zonedDateTimeToDate
} from './index.mjs';

const eventInput = {
  mode: 'mais-tarde', title: 'Cinema', place: 'Centro', description: '', threshold: 2,
  startsAt: '2026-08-03T21:00:00.000Z', alternatives: ['2026-08-03T22:00:00.000Z'],
  days: [], createdByName: 'Ana', votingClosed: false
};

describe('multi-option event API validation', () => {
  it('accepts multiple absolute option ids and rejects display labels', () => {
    const event = validateEvent(eventInput);
    expect(validateVote({ participantId: 'p1', voterName: 'Bia', response: 'accept', preferredOptions: [
      '2026-08-03T21:00:00.000Z', '2026-08-03T22:00:00.000Z'
    ] }, event).preferredOptions).toHaveLength(2);
    expect(() => validateVote({ participantId: 'p1', voterName: 'Bia', response: 'accept', preferredOptions: ['18:00'] }, event)).toThrow('Marque pelo menos um horário');
    expect(validateVote({ participantId: 'p1', voterName: 'Bia', response: 'accept', preferredOptions: [
      '2026-08-03T22:00:00+00:00'
    ] }, event).preferredOptions).toEqual(['2026-08-03T22:00:00.000Z']);
    expect(() => validateVote({ participantId: 'p1', voterName: 'Bia', response: 'accept', preferredOptions: [''] }, event))
      .toThrow('Marque pelo menos um horário');
  });

  it('permits a decision only for an offered option', () => {
    expect(validateEvent({ ...eventInput, decidedOption: '2026-08-03T22:00:00.000Z' }).decidedOption)
      .toBe('2026-08-03T22:00:00.000Z');
    expect(() => validateEvent({ ...eventInput, decidedOption: '2026-08-04T22:00:00.000Z' }))
      .toThrow('não pertence');
  });

  it('requires timezone-aware instants and constrains untrusted fields', () => {
    expect(() => validateEvent({ ...eventInput, startsAt: '2026-08-03T21:00:00' }))
      .toThrow('incluir o fuso horário');
    expect(() => validateEvent({ ...eventInput, threshold: 1 })).toThrow('entre 2 e 999');
    expect(validateEvent({ ...eventInput, threshold: 2 }).threshold).toBe(2);
    expect(validateEvent({ ...eventInput, threshold: 999 }).threshold).toBe(999);
    expect(() => validateEvent({ ...eventInput, threshold: 1000 })).toThrow('entre 2 e 999');
    expect(() => validateEvent({ ...eventInput, title: 'x'.repeat(121) })).toThrow('no máximo 120');
  });

  it('rejects malformed and duplicate alternative instants', () => {
    expect(() => validateEvent({ ...eventInput, alternatives: ['amanhã às 22h'] }))
      .toThrow('Data ou horário inválido');
    expect(() => validateEvent({ ...eventInput, alternatives: [eventInput.startsAt] }))
      .toThrow('horário principal não pode ser repetido');
    expect(() => validateEvent({ ...eventInput, alternatives: [
      '2026-08-03T22:00:00Z', '2026-08-03T22:00:00.000+00:00'
    ] })).toThrow('Não repita horários alternativos');
  });

  it('requires a non-empty marcar schedule with real unique dates, ids, and clock values', () => {
    const marcar = {
      ...eventInput, mode: 'marcar', startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo',
      days: [{ id: 'dia_1', label: 'seg. 03', date: '2026-08-03', slots: ['18:00'] }]
    };
    expect(validateEvent(marcar)).toMatchObject({ timeZone: 'America/Sao_Paulo' });
    expect(() => validateEvent({ ...marcar, days: [] })).toThrow('pelo menos um dia');
    expect(() => validateEvent({ ...marcar, days: [{ ...marcar.days[0], date: '2026-02-30' }] })).toThrow('Data de dia inválida');
    expect(() => validateEvent({ ...marcar, days: [{ ...marcar.days[0], slots: ['99:99'] }] })).toThrow('Horário inválido');
    expect(() => validateEvent({ ...marcar, days: [marcar.days[0], { ...marcar.days[0], date: '2026-08-04' }] })).toThrow('identificador');
    expect(() => validateEvent({ ...marcar, days: [marcar.days[0], { ...marcar.days[0], id: 'dia_2' }] })).toThrow('mesma data');
    expect(() => validateEvent({ ...marcar, timeZone: undefined })).toThrow('Informe o fuso horário');
    expect(validateEvent({ ...marcar, timeZone: undefined }, { allowMissingTimeZone: true }).timeZone).toBeNull();
    expect(() => validateEvent({ ...marcar, timeZone: 'Mars/Olympus_Mons' })).toThrow('Fuso horário inválido');
  });

  it('rejects cross-mode edits before any persisted mode can be overwritten', () => {
    expect(() => assertPatchMode({ mode: 'agora' }, { mode: 'marcar' })).toThrow('Não é possível alterar');
    expect(() => assertPatchMode({ mode: 'agora' }, { mode: 'invalid' })).toThrow('Tipo de Bora inválido');
    expect(() => assertPatchMode({ mode: 'agora' }, { mode: 'agora' })).not.toThrow();
  });

  it('rejects missing or stale organizer revisions', () => {
    expect(() => assertEventRevision({ revision: 3 }, { revision: 3 })).not.toThrow();
    expect(() => assertEventRevision({ revision: 3 }, {})).toThrow('alterado em outro lugar');
    expect(() => assertEventRevision({ revision: 3 }, { revision: 2 })).toThrow('alterado em outro lugar');
  });

  it('does not persist availability or preferences for a decline', () => {
    const event = validateEvent({
      mode: 'marcar', title: 'Jantar', place: 'Centro', description: '', threshold: 2,
      startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo', createdByName: 'Ana', votingClosed: false,
      days: [{ id: 'sexta', label: 'sex. 03', date: '2026-08-03', slots: ['18:00'] }]
    });
    const vote = validateVote({
      participantId: 'p1', voterName: 'Bia', response: 'decline',
      preferredOptions: ['sexta:18:00'], availability: { sexta: ['18:00'] }
    }, event);
    expect(vote).toMatchObject({ response: 'decline', preferredOptions: [], availability: {} });
  });

  it('turns post-decision responses into attendance for the chosen option', () => {
    const later = validateEvent({ ...eventInput, decidedOption: '2026-08-03T22:00:00.000Z' });
    expect(validateVote({ participantId: 'p1', voterName: 'Bia', response: 'accept', preferredOptions: [eventInput.startsAt] }, later))
      .toMatchObject({ preferredOptions: ['2026-08-03T22:00:00.000Z'], availability: {} });
    const marcar = validateEvent({ ...eventInput, mode: 'marcar', startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo', decidedOption: 'terca:20:00', days: [{ id: 'terca', label: 'terça', date: '2026-08-04', slots: ['19:00', '20:00'] }] });
    expect(validateVote({ participantId: 'p1', voterName: 'Bia', response: 'maybe', availability: { terca: ['19:00'] } }, marcar))
      .toMatchObject({ preferredOptions: [], availability: { terca: ['20:00'] } });
  });

  it('bounds availability to known non-empty event days', () => {
    const event = validateEvent({
      ...eventInput, mode: 'marcar', startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo',
      days: [{ id: 'sexta', label: 'sex. 03', date: '2026-08-03', slots: ['18:00', '19:00'] }]
    });
    const unknownAvailability = Object.fromEntries(Array.from({ length: 2_000 }, (_, index) => [`unknown_${index}`, []]));
    const vote = validateVote({
      participantId: 'p1', voterName: 'Bia', response: 'maybe', preferredOptions: [],
      availability: { ...unknownAvailability, sexta: ['18:00', '18:00', '99:99'] }
    }, event);
    expect(vote.availability).toEqual({ sexta: ['18:00'] });
  });

  it('keeps the creator available for every offered option after schedule edits', () => {
    const later = validateEvent(eventInput);
    expect(creatorVoteSchedule(later)).toEqual({
      preferredOptions: ['2026-08-03T21:00:00.000Z', '2026-08-03T22:00:00.000Z'],
      availability: {}
    });
    const marcar = validateEvent({
      ...eventInput, mode: 'marcar', startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo',
      days: [{ id: 'dia_1', label: 'segunda', date: '2026-08-03', slots: ['18:00', '19:00'] }]
    });
    expect(creatorVoteSchedule(marcar)).toEqual({
      preferredOptions: [], availability: { dia_1: ['18:00', '19:00'] }
    });
  });

  it('retains guest selections only when the underlying option identity survives an edit', () => {
    const current = {
      ...eventInput, mode: 'marcar', startsAt: null, alternatives: [], timeZone: 'America/Sao_Paulo',
      days: [
        { id: 'same_day', label: 'segunda', date: '2026-08-03', slots: ['18:00', '19:00'] },
        { id: 'moved_day', label: 'terça', date: '2026-08-04', slots: ['18:00'] }
      ]
    };
    const updated = {
      ...current,
      days: [
        { ...current.days[0], slots: ['18:00'] },
        { ...current.days[1], date: '2026-08-05' }
      ]
    };
    expect(retainedGuestSchedule(current, updated)).toEqual({
      preferredOptions: [],
      availability: { same_day: ['18:00'] }
    });

    const later = validateEvent(eventInput);
    expect(retainedGuestSchedule(later, { ...later, alternatives: [] }).preferredOptions)
      .toEqual(['2026-08-03T21:00:00.000Z']);
  });
});

describe('event notification rules', () => {
  const event = { id: 'evt_1', title: 'Cinema', threshold: 2, created_by_participant_id: 'ana', notify_creator_on_vote: true, starts_at: new Date('2099-08-03T21:00:00.000Z'), place: 'Centro', days: [], decided_option: null };

  it('notifies the creator about another participant vote and everyone when the threshold is reached', () => {
    const notifications = voteNotificationPlan(event, { id: 'vote_1', participantId: 'bia', voterName: 'Bia' }, 2, 'request_1');
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ audience: 'creator', kind: 'vote-request_1' }),
      expect.objectContaining({ audience: 'participants', kind: 'threshold-reached-request_1' })
    ]));
  });

  it('never notifies the creator about their own vote', () => {
    expect(voteNotificationPlan(event, { id: 'vote_1', participantId: 'ana', voterName: 'Ana' }, 1)).toEqual([]);
  });

  it('honors the event-level creator vote-notification opt-out', () => {
    expect(voteNotificationPlan({ ...event, notify_creator_on_vote: false }, { id: 'vote_1', participantId: 'bia', voterName: 'Bia' }, 1)).toEqual([]);
  });

  it('notifies participants about confirmation and schedule or location changes', () => {
    expect(eventUpdateNotificationPlan(event, { ...event, decided_option: '2099-08-03T21:00:00.000Z' })).toEqual([expect.objectContaining({ kind: 'confirmed' })]);
    expect(eventUpdateNotificationPlan(event, { ...event, place: 'Outro lugar' })).toEqual([expect.objectContaining({ audience: 'participants', kind: expect.stringMatching(/^changed-/) })]);
    expect(eventUpdateNotificationPlan({ ...event, alternatives: [] }, { ...event, alternatives: ['2099-08-03T22:00:00.000Z'] }))
      .toEqual([expect.objectContaining({ audience: 'participants', preference: 'changes' })]);
  });

  it('notifies participants when an event is deleted before it starts', () => {
    expect(deletionNotificationPlan(event, new Date('2099-08-03T20:00:00.000Z').getTime())).toEqual([expect.objectContaining({ audience: 'participants', kind: 'cancelled' })]);
    expect(deletionNotificationPlan(event, new Date('2099-08-03T22:00:00.000Z').getTime())).toEqual([]);
  });
});

describe('reminder time resolution', () => {
  it('uses the selected mais-tarde alternative instead of the primary time', () => {
    const start = eventStartAt({ mode: 'mais-tarde', starts_at: new Date('2099-08-03T21:00:00.000Z'), decided_option: '2099-08-03T23:00:00.000Z' });
    expect(start?.toISOString()).toBe('2099-08-03T23:00:00.000Z');
  });

  it('resolves marcar wall clocks with an explicit IANA timezone independent of the server timezone', () => {
    expect(zonedDateTimeToDate('2026-08-03', '18:00', 'America/Sao_Paulo')?.toISOString())
      .toBe('2026-08-03T21:00:00.000Z');
    expect(zonedDateTimeToDate('2026-07-03', '18:00', 'America/New_York')?.toISOString())
      .toBe('2026-07-03T22:00:00.000Z');
    expect(zonedDateTimeToDate('2026-03-08', '02:30', 'America/New_York')).toBeNull();
    const event = {
      mode: 'marcar', decided_option: 'day_1:18:00', event_timezone: 'America/Sao_Paulo',
      days: [{ id: 'day_1', date: '2026-08-03', slots: ['18:00'] }]
    };
    expect(eventStartAt(event)?.toISOString()).toBe('2026-08-03T21:00:00.000Z');
    expect(eventStartAt({ ...event, event_timezone: null })).toBeNull();
  });

  it('schedules only immediate or decided events and queries narrow indexed windows in batches', () => {
    expect(reminderStartAt({ mode: 'mais-tarde', starts_at: new Date('2099-08-03T21:00:00.000Z'), decided_option: null })).toBeNull();
    expect(reminderStartAt({ mode: 'mais-tarde', starts_at: new Date('2099-08-03T21:00:00.000Z'), decided_option: '2099-08-03T23:00:00.000Z' })?.toISOString())
      .toBe('2099-08-03T23:00:00.000Z');
    const query = dueReminderQuery({
      now: new Date('2099-08-02T21:00:00.000Z').getTime(),
      cursor: { startsAt: '2099-08-03T20:00:00.000Z', id: 'evt_1' },
      limit: 75
    });
    expect(query.text).toContain('reminder_starts_at');
    expect(query.text).toContain('(reminder_starts_at, id) >');
    expect(query.text).not.toContain("mode = 'agora'");
    expect(query.values).toEqual([
      '2099-08-02T21:00:00.000Z', '2099-08-03T21:00:00.000Z',
      '2099-08-03T20:00:00.000Z', 'evt_1', 75
    ]);
    expect(query.values[0]).toBe('2099-08-02T21:00:00.000Z');
    expect(reminderNotificationKind('24h', { reminder_starts_at: '2099-08-03T21:00:00.000Z' }))
      .toBe('reminder-24h:2099-08-03T21:00:00.000Z');
  });
});

describe('vote read pagination', () => {
  it('uses an immutable deterministic cursor and fetches one look-ahead row', () => {
    const first = votePageQuery('evt_1', { limit: 200 });
    expect(first.text).toContain('order by created_at desc, id desc');
    expect(first.values).toEqual(['evt_1', 201]);

    const next = votePageQuery('evt_1', {
      limit: 50,
      cursor: { createdAt: '2099-08-03T21:00:00.000Z', id: 'vote_1' }
    });
    expect(next.text).toContain('(created_at, id) <');
    expect(next.values).toEqual(['evt_1', '2099-08-03T21:00:00.000Z', 'vote_1', 51]);
  });
});

describe('future schedule parity', () => {
  it('rejects past schedules at creation while permitting an unchanged past schedule during edit', () => {
    const event = validateEvent({ ...eventInput, startsAt: '2026-08-03T21:00:00.000Z', alternatives: [] });
    const now = new Date('2026-08-04T00:00:00.000Z').getTime();
    expect(() => validateFutureSchedule(event, { now })).toThrow('horários futuros');
    expect(() => validateFutureSchedule(event, { now, allowedPastKeys: scheduleEntryKeys(event) })).not.toThrow();
    expect(() => validateFutureSchedule({ ...event, startsAt: '2026-08-03T22:00:00.000Z' }, {
      now, allowedPastKeys: scheduleEntryKeys(event)
    })).toThrow('horários futuros');
  });

  it('rejects a wall clock that does not exist because of a DST jump', () => {
    const event = validateEvent({
      ...eventInput, mode: 'marcar', startsAt: null, alternatives: [], timeZone: 'America/New_York',
      days: [{ id: 'dst_day', label: 'domingo', date: '2026-03-08', slots: ['02:30'] }]
    });
    expect(() => validateFutureSchedule(event, { now: 0 })).toThrow('não existe no fuso horário');
  });
});

describe('past Bora closure', () => {
  it('treats a Bora as over once its scheduled start has passed', () => {
    expect(eventHasOccurred({ mode: 'agora', starts_at: '2026-08-03T21:00:00.000Z' }, new Date('2026-08-03T21:00:00.000Z').getTime())).toBe(true);
    expect(eventHasOccurred({ mode: 'agora', starts_at: '2026-08-03T21:00:00.000Z' }, new Date('2026-08-03T20:59:59.999Z').getTime())).toBe(false);
  });

  it('closes a decided scheduling Bora at its selected time', () => {
    expect(eventHasOccurred({
      mode: 'mais-tarde', starts_at: '2026-08-03T18:00:00.000Z', decided_option: '2026-08-03T21:00:00.000Z'
    }, new Date('2026-08-03T21:00:00.000Z').getTime())).toBe(true);
  });
});

describe('push targeting', () => {
  const event = { id: 'evt_1', created_by_participant_id: 'creator' };

  it('binds only the parameter used by creator queries', () => {
    const query = pushSubscriptionQuery(event, 'creator', 'votes');
    expect(query.values).toEqual(['creator']);
    expect(query.text).toContain('where (participant_id = $1) and notify_votes = true');
    expect(query.text).not.toContain('$2');
  });

  it('applies participant preferences to the whole creator-or-voter audience', () => {
    const query = pushSubscriptionQuery(event, 'participants', 'changes');
    expect(query.values).toEqual(['creator', 'evt_1']);
    expect(query.text).toContain('where (participant_id = $1 or participant_id in');
    expect(query.text).toContain(') and notify_changes = true');
  });

  it('distinguishes an orphaned browser subscription from a server registration', () => {
    expect(pushPreferencesResponse(undefined)).toEqual({ subscribed: false, preferences: {} });
    expect(pushPreferencesResponse({
      notify_votes: false, notify_changes: true, notify_confirmed: false, notify_threshold: true, notify_upcoming: false, notify_messages: false
    })).toEqual({
      subscribed: true,
      preferences: { votes: false, changes: true, confirmed: false, threshold: true, upcoming: false, messages: false }
    });
  });

  it('bounds delivery concurrency and stops starting work after a deadline', async () => {
    let active = 0;
    let maxActive = 0;
    await runBoundedWork([1, 2, 3, 4], async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    }, { concurrency: 2 });
    expect(maxActive).toBe(2);

    let timestamp = 0;
    const visited = [];
    await runBoundedWork([1, 2, 3, 4], async (item) => {
      visited.push(item);
      timestamp += 10;
    }, { concurrency: 1, deadlineAt: 15, now: () => timestamp });
    expect(visited).toEqual([1, 2]);
  });
});

describe('rate limiting boundaries', () => {
  const request = (remoteAddress, forwarded = '') => ({ socket: { remoteAddress }, headers: { 'x-forwarded-for': forwarded } });

  it('ignores forwarded addresses without an explicitly trusted proxy hop', () => {
    expect(resolveClientAddress(request('203.0.113.10', '198.51.100.99'), 0)).toBe('203.0.113.10');
  });

  it('resolves nginx-only and Caddy-to-nginx forwarding chains from right to left', () => {
    expect(resolveClientAddress(request('172.18.0.3', '203.0.113.10'), 1)).toBe('203.0.113.10');
    expect(resolveClientAddress(request('172.18.0.3', '203.0.113.10, 172.18.0.2'), 2)).toBe('203.0.113.10');
    expect(resolveClientAddress(request('172.18.0.3', 'forged, 172.18.0.2'), 2)).toBe('172.18.0.3');
  });

  it('classifies creation URLs by parsed pathname even when a query string is present', () => {
    const limiter = createRateLimiter({ now: () => 1_000, proxyHops: 0 });
    const response = { setHeader() {} };
    const mutation = { method: 'POST', url: '/api/events?campaign=test', socket: { remoteAddress: '203.0.113.10' }, headers: {} };
    for (let count = 0; count < 12; count += 1) expect(() => limiter(mutation, response)).not.toThrow();
    expect(() => limiter(mutation, response)).toThrow('Muitas tentativas');
  });

  it('supports a capped explicit test scale without weakening the production default', () => {
    const response = { setHeader() {} };
    const mutation = { method: 'POST', url: '/api/events', socket: { remoteAddress: '203.0.113.10' }, headers: {} };
    const doubled = createRateLimiter({ now: () => 1_000, proxyHops: 0, scale: 2 });
    for (let count = 0; count < 24; count += 1) expect(() => doubled(mutation, response)).not.toThrow();
    expect(() => doubled(mutation, response)).toThrow('Muitas tentativas');

    const capped = createRateLimiter({ now: () => 1_000, proxyHops: 0, scale: 1_000 });
    for (let count = 0; count < 1_200; count += 1) expect(() => capped(mutation, response)).not.toThrow();
    expect(() => capped(mutation, response)).toThrow('Muitas tentativas');
  });

  it('keeps a hard bucket cap and groups overflow clients instead of growing memory', () => {
    const limiter = createRateLimiter({ maxBuckets: 3, now: () => 1_000, proxyHops: 0 });
    const response = { setHeader() {} };
    for (let count = 1; count <= 50; count += 1) {
      limiter({ method: 'PATCH', url: `/api/events/event-${count}`, socket: { remoteAddress: `203.0.113.${count}` }, headers: {} }, response);
    }
    expect(limiter.bucketCount()).toBeLessThanOrEqual(3);
  });
});

describe('public metrics privacy', () => {
  it('does not expose exact non-zero presence cohorts smaller than five', () => {
    expect(coarsenPresenceCount(0)).toBe(0);
    expect(coarsenPresenceCount(1)).toBe(4);
    expect(coarsenPresenceCount(4)).toBe(4);
    expect(coarsenPresenceCount(5)).toBe(5);
  });
});

describe('public invite slugs', () => {
  it('uses a lowercase URL-safe 128-bit random suffix', () => {
    const slug = slugify('Café com amigos');
    expect(slug).toMatch(/^cafe-com-amigos-[a-f0-9]{32}$/);
  });

  it('retries only slug uniqueness conflicts and returns the successful insert', async () => {
    let calls = 0;
    const result = await withUniqueSlug('Cinema', async (slug) => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('collision'), { code: '23505', constraint: 'events_slug_key' });
      return slug;
    });
    expect(calls).toBe(3);
    expect(result).toMatch(/^cinema-[a-f0-9]{32}$/);

    await expect(withUniqueSlug('Cinema', async () => {
      throw Object.assign(new Error('different constraint'), { code: '23505', constraint: 'votes_event_id_participant_id_key' });
    })).rejects.toThrow('different constraint');
  });
});
