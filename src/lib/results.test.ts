import { describe, expect, it } from 'vitest';
import { acceptedCount, availabilityResults, eventStatusText, groupAvailabilityResults, preferenceResults, resultDateLabel, thresholdProgressPercentage } from './results';
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
  it('counts selected availability from both Posso and Talvez responses', () => {
    expect(availabilityResults(event, votes).map(({ slot, count, names }) => ({ slot, count, names }))).toEqual([
      { slot: '18:00', count: 2, names: ['Ana', 'Bia'] },
      { slot: '19:00', count: 2, names: ['Ana', 'Caio'] }
    ]);
  });

  it('groups availability by a stable formatted day label', () => {
    expect(groupAvailabilityResults(availabilityResults(event, votes))).toHaveLength(1);
  });

  it('keeps preference counts tied to stable option ids', () => {
    const timedEvent = { ...event, mode: 'mais-tarde' as const, startsAt: '2099-08-01T18:00:00.000Z', alternatives: ['2099-08-01T19:00:00.000Z'], days: [] };
    const timedVotes = votes.map((vote) => ({ ...vote, preferredOptions: ['2099-08-01T19:00:00.000Z'] }));
    expect(preferenceResults(timedEvent, timedVotes)[0]).toMatchObject({ option: { id: '2099-08-01T19:00:00.000Z' }, count: 3 });
  });

  it('counts both Posso and Talvez preferences, but never Não posso', () => {
    const option = '2099-08-01T19:00:00.000Z';
    const timedEvent = { ...event, mode: 'mais-tarde' as const, startsAt: option, alternatives: [], days: [] };
    const timedVotes = [
      { ...votes[0], response: 'accept' as const, preferredOptions: [option] },
      { ...votes[1], response: 'maybe' as const, preferredOptions: [option] },
      { ...votes[2], response: 'decline' as const, preferredOptions: [option] }
    ];
    expect(preferenceResults(timedEvent, timedVotes)[0].count).toBe(2);
  });

  it('counts every option selected by a Talvez response independently', () => {
    const primary = '2099-08-01T18:00:00.000Z';
    const alternative = '2099-08-02T18:00:00.000Z';
    const timedEvent = {
      ...event,
      mode: 'mais-tarde' as const,
      startsAt: primary,
      alternatives: [alternative],
      days: [],
      threshold: 3
    };
    const timedVotes = [
      { ...votes[0], response: 'accept' as const, preferredOptions: [primary] },
      { ...votes[1], response: 'accept' as const, preferredOptions: [primary] },
      { ...votes[2], response: 'maybe' as const, preferredOptions: [primary, alternative] }
    ];

    expect(preferenceResults(timedEvent, timedVotes).map(({ option, count }) => [option.id, count]))
      .toEqual([[primary, 3], [alternative, 1]]);
  });

  it('uses exact aggregate option totals when the visible name list is truncated', () => {
    const option = '2099-08-01T19:00:00.000Z';
    const timedEvent = { ...event, mode: 'mais-tarde' as const, startsAt: option, alternatives: [], days: [] };
    expect(preferenceResults(timedEvent, [], { [option]: 17 })[0].count).toBe(17);
    expect(availabilityResults(event, [], { 'friday:18:00': 12 })[0]).toMatchObject({ slot: '18:00', count: 12 });
  });

  it('reports closed voting before confirmation progress', () => {
    expect(eventStatusText({ ...event, votingClosed: true }, votes)).toBe('Confirmações encerradas.');
  });

  it('reports reached, singular, and plural confirmation targets', () => {
    expect(acceptedCount(votes)).toBe(2);
    expect(eventStatusText({ ...event, threshold: 2 }, votes)).toBe('Meta de confirmações atingida.');
    expect(eventStatusText({ ...event, threshold: 3 }, votes)).toBe('Falta 1 confirmação.');
    expect(eventStatusText({ ...event, threshold: 4 }, votes)).toBe('Faltam 2 confirmações.');
  });

  it('recalculates completion when the required confirmations change', () => {
    expect(thresholdProgressPercentage(2, 2)).toBe(100);
    expect(thresholdProgressPercentage(2, 4)).toBe(50);
    expect(thresholdProgressPercentage(3, 2)).toBe(100);
    expect(thresholdProgressPercentage(-1, 2)).toBe(0);
    expect(thresholdProgressPercentage(1, 0)).toBe(0);
    expect(thresholdProgressPercentage(Number.NaN, 2)).toBe(0);
  });

  it('groups separate calendar days and supports compact date labels', () => {
    const secondDay = { id: 'saturday', label: 'sáb. 02', date: '2099-08-02', slots: ['20:00'] };
    const groups = groupAvailabilityResults(availabilityResults({ ...event, days: [...event.days, secondDay] }, votes));
    expect(groups).toHaveLength(2);
    expect(resultDateLabel(secondDay.date)).toMatch(/02/);
  });
});
