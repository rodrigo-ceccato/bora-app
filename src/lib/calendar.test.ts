import { describe, expect, it } from 'vitest';
import { calendarDetails, calendarIcs, googleCalendarUrl } from './calendar';
import type { BoraEvent } from './types';

const baseEvent: BoraEvent = {
  id: 'evt_test', slug: 'teste', mode: 'mais-tarde', title: 'Cinema, com amigos', place: 'Centro', description: 'Levar pipoca', threshold: 3,
  startsAt: '2099-08-01T21:00:00.000Z', alternatives: ['2099-08-01T22:00:00.000Z'], days: [], votingClosed: true, createdAt: '2099-01-01T00:00:00.000Z', decidedOption: '2099-08-01T22:00:00.000Z'
};

describe('calendar helpers', () => {
  it('makes calendar details for a Bora agora fixed time', () => {
    const event: BoraEvent = { ...baseEvent, mode: 'agora', startsAt: '2099-08-01T21:00:00.000Z', decidedOption: undefined };
    const details = calendarDetails(event);
    expect(details?.floating).toBe(false);
    expect(googleCalendarUrl(event, details!)).toContain('dates=20990801T210000Z%2F20990801T230000Z');
  });
  it('makes a Google Calendar link from an absolute decided option', () => {
    const details = calendarDetails(baseEvent);
    expect(details?.floating).toBe(false);
    expect(googleCalendarUrl(baseEvent, details!)).toContain('dates=20990801T220000Z%2F20990802T000000Z');
  });
  it('creates an ICS file with escaped event fields', () => {
    const ics = calendarIcs(baseEvent, calendarDetails(baseEvent)!);
    expect(ics).toContain('DTSTART:20990801T220000Z');
    expect(ics).toContain('SUMMARY:Cinema\\, com amigos');
  });
  it('uses the selected day and time for a Bora marcar decision', () => {
    const event: BoraEvent = { ...baseEvent, mode: 'marcar', startsAt: undefined, alternatives: [], decidedOption: 'sabado:18:00', days: [{ id: 'sabado', label: 'sáb. 01', date: '2099-08-01', slots: ['18:00'] }] };
    const details = calendarDetails(event);
    expect(details?.floating).toBe(true);
    expect(googleCalendarUrl(event, details!)).toContain('dates=20990801T180000%2F20990801T200000');
  });
});
