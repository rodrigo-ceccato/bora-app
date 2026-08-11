import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import { calendarDetails, calendarIcs } from '../src/lib/calendar.ts';

describe('calendar export standards compatibility', () => {
  it('round-trips a generated event through the maintained ical.js parser', () => {
    const event = {
      id: 'evt_parser',
      slug: 'parser',
      mode: 'mais-tarde',
      title: 'Cinema, ação; 🎉',
      place: 'Centro',
      description: `Primeira linha\n${'descrição longa 🎉 '.repeat(10)}`,
      threshold: 3,
      startsAt: '2099-08-01T21:00:00.000Z',
      alternatives: ['2099-08-01T22:00:00.000Z'],
      days: [],
      votingClosed: true,
      createdAt: '2099-01-01T00:00:00.000Z',
      decidedOption: '2099-08-01T22:00:00.000Z'
    };

    const source = calendarIcs(event, calendarDetails(event));
    const calendar = new ICAL.Component(ICAL.parse(source));
    const parsed = new ICAL.Event(calendar.getFirstSubcomponent('vevent'));

    expect(calendar.getFirstPropertyValue('version')).toBe('2.0');
    expect(parsed.uid).toBe('bora-evt_parser@bora-app');
    expect(parsed.summary).toBe(event.title);
    expect(parsed.location).toBe(event.place);
    expect(parsed.description).toBe(event.description);
    expect(parsed.startDate.toJSDate().toISOString()).toBe('2099-08-01T22:00:00.000Z');
    expect(parsed.endDate.toJSDate().toISOString()).toBe('2099-08-02T00:00:00.000Z');
  });
});
