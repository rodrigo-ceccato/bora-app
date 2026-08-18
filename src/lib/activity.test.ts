import { describe, expect, it } from 'vitest';
import { upcomingActivityCopy } from './activity';

const configuredTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const expectedTimesByZone: Record<string, { today: string; tomorrow: string }> = {
  UTC: { today: '23:00', tomorrow: '15:30' },
  'America/Sao_Paulo': { today: '20:00', tomorrow: '12:30' },
  'America/New_York': { today: '19:00', tomorrow: '11:30' }
};

describe('upcoming activity copy', () => {
  it('uses human-readable relative days and near-start context', () => {
    const expectedTimes = expectedTimesByZone[configuredTimeZone];
    if (!expectedTimes) throw new Error(`Add explicit expectations for TZ=${configuredTimeZone}`);

    expect(upcomingActivityCopy('2026-08-18T20:00:00-03:00', new Date('2026-08-18T15:00:00-03:00')))
      .toEqual({ primaryMessage: `Hoje às ${expectedTimes.today}`, secondaryMessage: 'Começa em 5 horas.' });
    expect(upcomingActivityCopy('2026-08-19T12:30:00-03:00', new Date('2026-08-18T15:00:00-03:00')).primaryMessage)
      .toBe(`Amanhã às ${expectedTimes.tomorrow}`);
  });
});
