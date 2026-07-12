import { describe, expect, it } from 'vitest';
import { defaultDays, normalizeLines, responseLabel, slugify } from './schedule';

describe('schedule helpers', () => {
  it('creates responsive schedule defaults', () => {
    const days = defaultDays();
    expect(days).toHaveLength(3);
    expect(days[0].slots.length).toBeGreaterThan(0);
  });

  it('normalizes multiline alternatives', () => {
    expect(normalizeLines('Hoje 20h\n\n Amanhã 19h ')).toEqual(['Hoje 20h', 'Amanhã 19h']);
  });

  it('creates readable slugs and labels', () => {
    expect(slugify('Bora no Bar!')).toContain('bora-no-bar');
    expect(responseLabel('accept')).toBe('Topo');
  });
});
