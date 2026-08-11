import { describe, expect, it } from 'vitest';
import { localDateKey, toInstantIso, toPickerValue } from './datetime';

const configuredTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const expectedByZone: Record<string, { picker: string; instant: string; day: string }> = {
  UTC: {
    picker: '2026-07-31T21:30:00',
    instant: '2026-07-31T18:30:00.000Z',
    day: '2026-08-01'
  },
  'America/Sao_Paulo': {
    picker: '2026-07-31T18:30:00',
    instant: '2026-07-31T21:30:00.000Z',
    day: '2026-07-31'
  },
  'America/New_York': {
    picker: '2026-07-31T17:30:00',
    instant: '2026-07-31T22:30:00.000Z',
    day: '2026-07-31'
  }
};

describe('local date/time conversion', () => {
  it('converts absolute instants to the configured wall clock', () => {
    const expected = expectedByZone[configuredTimeZone];
    if (!expected) throw new Error(`Add explicit expectations for TZ=${configuredTimeZone}`);
    expect(toPickerValue('2026-07-31T21:30:00.000Z')).toBe(expected.picker);
  });

  it('converts offset-less picker values back to an absolute instant', () => {
    const expected = expectedByZone[configuredTimeZone];
    if (!expected) throw new Error(`Add explicit expectations for TZ=${configuredTimeZone}`);
    expect(toInstantIso('2026-07-31T18:30:00')).toBe(expected.instant);
  });

  it('uses the local calendar date rather than truncating the UTC date', () => {
    const expected = expectedByZone[configuredTimeZone];
    if (!expected) throw new Error(`Add explicit expectations for TZ=${configuredTimeZone}`);
    expect(localDateKey(new Date('2026-08-01T01:30:00.000Z'))).toBe(expected.day);
  });

  it('leaves invalid input available for validation by its caller', () => {
    expect(toPickerValue('not-a-date')).toBe('not-a-date');
    expect(toInstantIso('not-a-date')).toBe('not-a-date');
    expect(toPickerValue()).toBeUndefined();
  });
});
