import { describe, expect, it } from 'vitest';
import { validateEvent, validateVote } from './index.mjs';

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
