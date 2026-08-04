import { describe, expect, it } from 'vitest';
import { availabilityResults, eventStatusText, groupAvailabilityResults, preferenceResults } from './results';
import type { BoraEvent, BoraVote } from './types';

const event: BoraEvent = {
  id: 'event', slug: 'event', mode: 'marcar', title: 'Jantar', place: 'Centro', threshold: 2,
  alternatives: [], days: [{ id: 'friday', label: 'sex. 01', date: '2099-08-01', slots: ['18:00', '19:00'] }],
  votingClosed: false, createdAt: '2099-01-01T00:00:00.000Z'
};

const votes: BoraVote[] = [
  { id: '1', eventId: 'event', voterName: 'Ana', response: 'accept', preferredOptions: [], availability: { friday: ['18:00', '19:00'] }, createdAt: '' },
  { id: '2', eventId: 'event', voterName: 'Bia', response: 'accept', preferredOptions: [], availability: { friday: ['18:00'] }, createdAt: '' },
  { id: '3', eventId: 'event', voterName: 'Caio', response: 'maybe', preferredOptions: [], availability: { friday: ['19:00'] }, createdAt: '' }
];

describe('event results', () => {
  it('counts only accepted availability and ranks the most available slot first', () => {
    expect(availabilityResults(event, votes).map(({ slot, count, names }) => ({ slot, count, names }))).toEqual([
      { slot: '18:00', count: 2, names: ['Ana', 'Bia'] },
      { slot: '19:00', count: 1, names: ['Ana'] }
    ]);
  });

  it('groups availability by a stable formatted day label', () => {
    expect(groupAvailabilityResults(availabilityResults(event, votes))).toHaveLength(1);
  });

  it('keeps preference counts tied to stable option ids', () => {
    const timedEvent = { ...event, mode: 'mais-tarde' as const, startsAt: '2099-08-01T18:00:00.000Z', alternatives: ['2099-08-01T19:00:00.000Z'], days: [] };
    const timedVotes = votes.map((vote, index) => ({ ...vote, preferredOptions: index < 2 ? ['2099-08-01T19:00:00.000Z'] : [] }));
    expect(preferenceResults(timedEvent, timedVotes)[0]).toMatchObject({ option: { id: '2099-08-01T19:00:00.000Z' }, count: 2 });
  });

  it('reports closed voting before confirmation progress', () => {
    expect(eventStatusText({ ...event, votingClosed: true }, votes)).toBe('Confirmações encerradas.');
  });
});
