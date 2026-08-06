import { describe, expect, it } from 'vitest';
import { deletionNotificationPlan, eventUpdateNotificationPlan, validateEvent, validateVote, voteNotificationPlan } from './index.mjs';

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
    expect(() => validateEvent({ ...eventInput, threshold: 0 })).toThrow('entre 1 e 999');
    expect(() => validateEvent({ ...eventInput, title: 'x'.repeat(121) })).toThrow('no máximo 120');
  });

  it('does not persist availability or preferences for a decline', () => {
    const event = validateEvent({
      mode: 'marcar', title: 'Jantar', place: 'Centro', description: '', threshold: 2,
      startsAt: null, alternatives: [], createdByName: 'Ana', votingClosed: false,
      days: [{ id: 'sexta', label: 'sex. 03', date: '2026-08-03', slots: ['18:00'] }]
    });
    const vote = validateVote({
      participantId: 'p1', voterName: 'Bia', response: 'decline',
      preferredOptions: ['sexta:18:00'], availability: { sexta: ['18:00'] }
    }, event);
    expect(vote).toMatchObject({ response: 'decline', preferredOptions: [], availability: {} });
  });
});

describe('event notification rules', () => {
  const event = { id: 'evt_1', title: 'Cinema', threshold: 2, created_by_participant_id: 'ana', notify_creator_on_vote: true, starts_at: new Date('2099-08-03T21:00:00.000Z'), place: 'Centro', days: [], decided_option: null };

  it('notifies the creator about another participant vote and everyone when the threshold is reached', () => {
    const notifications = voteNotificationPlan(event, { id: 'vote_1', participantId: 'bia', voterName: 'Bia' }, 2, 'request_1');
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ audience: 'creator', kind: 'vote-request_1' }),
      expect.objectContaining({ audience: 'participants', kind: 'threshold-reached' })
    ]));
  });

  it('never notifies the creator about their own vote', () => {
    expect(voteNotificationPlan(event, { id: 'vote_1', participantId: 'ana', voterName: 'Ana' }, 1)).toEqual([]);
  });

  it('notifies participants about confirmation and schedule or location changes', () => {
    expect(eventUpdateNotificationPlan(event, { ...event, decided_option: '2099-08-03T21:00:00.000Z' })).toEqual([expect.objectContaining({ kind: 'confirmed' })]);
    expect(eventUpdateNotificationPlan(event, { ...event, place: 'Outro lugar' })).toEqual([expect.objectContaining({ audience: 'participants', kind: expect.stringMatching(/^changed-/) })]);
  });

  it('notifies participants when an event is deleted before it starts', () => {
    expect(deletionNotificationPlan(event, new Date('2099-08-03T20:00:00.000Z').getTime())).toEqual([expect.objectContaining({ audience: 'participants', kind: 'cancelled' })]);
    expect(deletionNotificationPlan(event, new Date('2099-08-03T22:00:00.000Z').getTime())).toEqual([]);
  });
});
