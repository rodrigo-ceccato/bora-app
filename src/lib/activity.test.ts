import { describe, expect, it } from 'vitest';
import { upcomingActivityCopy } from './activity';

describe('upcoming activity copy', () => {
  it('uses human-readable relative days and near-start context', () => {
    expect(upcomingActivityCopy('2026-08-18T20:00:00-03:00', new Date('2026-08-18T15:00:00-03:00')))
      .toEqual({ primaryMessage: 'Hoje às 20:00', secondaryMessage: 'Começa em 5 horas.' });
    expect(upcomingActivityCopy('2026-08-19T12:30:00-03:00', new Date('2026-08-18T15:00:00-03:00')).primaryMessage)
      .toBe('Amanhã às 12:30');
  });
});
