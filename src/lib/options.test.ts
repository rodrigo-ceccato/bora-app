import { describe, expect, it } from 'vitest';
import { eventOptions, optionIds, optionLabel } from './options';
import type { BoraEvent } from './types';

const baseEvent: BoraEvent = {
  id: 'evt_1', slug: 'teste', mode: 'mais-tarde', title: 'Teste', place: 'Bar', threshold: 2,
  startsAt: '2026-08-03T21:00:00.000Z', alternatives: ['2026-08-03T22:00:00.000Z'], days: [],
  votingClosed: false, createdAt: '2026-08-01T00:00:00.000Z'
};

describe('event options', () => {
  it('uses absolute instants as stable ids, independent of rendered timezone labels', () => {
    expect(eventOptions(baseEvent).map((option) => option.id)).toEqual([
      '2026-08-03T21:00:00.000Z', '2026-08-03T22:00:00.000Z'
    ]);
  });
  it('keeps a stable namespaced id for legacy rendered alternatives', () => {
    expect(optionIds({ ...baseEvent, alternatives: ['22:00'] })).toContain('legacy:22:00');
  });
  it('creates stable schedule ids from the day and slot', () => {
    const event = { ...baseEvent, mode: 'marcar' as const, startsAt: undefined, alternatives: [], days: [
      { id: 'wed', label: 'Qua', date: '2026-08-05', slots: ['18:00'] }
    ] };
    expect(eventOptions(event)).toEqual([{ id: 'wed:18:00', label: 'Qua · 18:00' }]);
  });
  it('returns no choices for modes without selectable schedule options', () => {
    expect(eventOptions({ ...baseEvent, mode: 'agora', alternatives: [] })).toEqual([]);
  });
  it('uses a readable fallback for missing and legacy option labels', () => {
    expect(optionLabel(baseEvent)).toBe('');
    expect(optionLabel(baseEvent, 'legacy:18:00')).toBe('18:00');
  });

  it('preserves unparseable legacy alternatives as labels and IDs', () => {
    const event = { ...baseEvent, alternatives: ['depois do trabalho'], startsAt: undefined };
    expect(eventOptions(event)).toEqual([{ id: 'legacy:depois do trabalho', label: 'depois do trabalho', primary: true }]);
    expect(optionLabel(event, 'unknown')).toBe('unknown');
  });
});
