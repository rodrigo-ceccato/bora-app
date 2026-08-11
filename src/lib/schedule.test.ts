import { describe, expect, it, vi } from 'vitest';
import { defaultDays, normalizeLines, responseLabel, slugify, uid } from './schedule';

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
    expect(slugify('!!!')).toMatch(/^bora-/);
    expect(uid('vote')).toMatch(/^vote_/);
    expect(responseLabel('accept')).toBe('Topo');
    expect(responseLabel('decline')).toBe('Não vou');
    expect(responseLabel('maybe')).toBe('Talvez');
  });

  it('mints bearer identifiers without using Math.random', () => {
    const insecureRandom = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not mint a capability');
    });
    const identifiers = Array.from({ length: 100 }, () => uid('participant'));
    expect(new Set(identifiers).size).toBe(100);
    expect(identifiers.every((value) => /^participant_[a-f0-9]{32}$/.test(value))).toBe(true);
    expect(slugify('Bora seguro')).toMatch(/^bora-seguro-[a-f0-9]{16}$/);
    expect(insecureRandom).not.toHaveBeenCalled();
  });
});
