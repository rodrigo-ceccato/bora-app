import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import { calendarDetails, calendarIcs, calendarZonedDateTime, googleCalendarUrl } from './calendar';
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
    const lines = ics.split('\r\n');
    expect(lines).toContain('DTSTART:20990801T220000Z');
    expect(lines).toContain('DTEND:20990802T000000Z');
    expect(lines.some((line) => /ZZ$/.test(line))).toBe(false);
    expect(ics).toContain('SUMMARY:Cinema\\, com amigos');
  });
  it('round-trips through a standards-compliant iCalendar parser', () => {
    const ics = calendarIcs(baseEvent, calendarDetails(baseEvent)!);
    const calendar = new ICAL.Component(ICAL.parse(ics));
    const component = calendar.getFirstSubcomponent('vevent');
    expect(component).toBeTruthy();
    const parsed = new ICAL.Event(component!);

    expect(parsed.summary).toBe('Cinema, com amigos');
    expect(parsed.location).toBe('Centro');
    expect(parsed.startDate.toJSDate().toISOString()).toBe('2099-08-01T22:00:00.000Z');
    expect(parsed.endDate.toJSDate().toISOString()).toBe('2099-08-02T00:00:00.000Z');
  });
  it('escapes every newline form instead of allowing ICS line injection', () => {
    const event = { ...baseEvent, description: 'Primeira linha\r\nATTENDEE:injetado\rÚltima linha' };
    const ics = calendarIcs(event, calendarDetails(event)!);
    expect(ics).toContain('DESCRIPTION:Primeira linha\\nATTENDEE:injetado\\nÚltima linha');
    expect(ics.split('\r\n')).not.toContain('ATTENDEE:injetado');
  });
  it('folds long Unicode content lines without exceeding 75 UTF-8 octets', () => {
    const event = { ...baseEvent, description: `Convidados: ${'ação 🎉 '.repeat(30)}` };
    const ics = calendarIcs(event, calendarDetails(event)!);
    const physicalLines = ics.split('\r\n');
    for (const line of physicalLines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:Convidados: ${'ação 🎉 '.repeat(30)}`);
  });
  it('uses the selected day and time for a Bora marcar decision', () => {
    const event: BoraEvent = { ...baseEvent, mode: 'marcar', startsAt: undefined, alternatives: [], decidedOption: 'sabado:18:00', days: [{ id: 'sabado', label: 'sáb. 01', date: '2099-08-01', slots: ['18:00'] }] };
    const details = calendarDetails(event);
    expect(details?.floating).toBe(true);
    expect(googleCalendarUrl(event, details!)).toContain('dates=20990801T180000%2F20990801T200000');
  });
  it('exports a marcar decision at the event-zone instant, independent of the viewer zone', () => {
    const event: BoraEvent = {
      ...baseEvent,
      mode: 'marcar', startsAt: undefined, alternatives: [], decidedOption: 'segunda:18:00',
      timeZone: 'America/Sao_Paulo',
      days: [{ id: 'segunda', label: 'seg. 03', date: '2026-08-03', slots: ['18:00'] }]
    };
    const details = calendarDetails(event);
    expect(details?.floating).toBe(false);
    expect(details?.startsAt.toISOString()).toBe('2026-08-03T21:00:00.000Z');
    expect(googleCalendarUrl(event, details!)).toContain('dates=20260803T210000Z%2F20260803T230000Z');
    expect(calendarIcs(event, details!)).toContain('DTSTART:20260803T210000Z');
  });
  it('rejects nonexistent event-zone wall clocks during a DST jump', () => {
    expect(calendarZonedDateTime('2026-03-08', '02:30', 'America/New_York')).toBeNull();
  });
  it('rejects missing, invalid, or unavailable calendar decisions', () => {
    expect(calendarDetails({ ...baseEvent, mode: 'agora', startsAt: undefined })).toBeNull();
    expect(calendarDetails({ ...baseEvent, mode: 'agora', startsAt: 'not-a-date' })).toBeNull();
    expect(calendarDetails({ ...baseEvent, mode: 'mais-tarde', decidedOption: undefined })).toBeNull();
    expect(calendarDetails({ ...baseEvent, mode: 'mais-tarde', decidedOption: 'not-a-date' })).toBeNull();
    expect(calendarDetails({ ...baseEvent, mode: 'marcar', decidedOption: 'missing-slot' })).toBeNull();
    expect(calendarDetails({ ...baseEvent, mode: 'marcar', decidedOption: 'missing:18:00', days: [] })).toBeNull();
  });
});
