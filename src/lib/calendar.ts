import type { BoraEvent } from './types';

export interface CalendarDetails {
  endsAt: Date;
  floating: boolean;
  startsAt: Date;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatFloating(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export function calendarDetails(event: BoraEvent): CalendarDetails | null {
  if (event.mode === 'agora') {
    if (!event.startsAt) return null;
    const startsAt = new Date(event.startsAt);
    if (Number.isNaN(startsAt.getTime())) return null;
    return { startsAt, endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000), floating: false };
  }
  if (!event.decidedOption) return null;
  if (event.mode === 'mais-tarde') {
    const startsAt = new Date(event.decidedOption);
    if (Number.isNaN(startsAt.getTime())) return null;
    return { startsAt, endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000), floating: false };
  }
  if (event.mode === 'marcar') {
    const match = event.decidedOption.match(/^(.+):(\d{2}:\d{2})$/);
    if (!match) return null;
    const [, dayId, slot] = match;
    const day = event.days.find((item) => item.id === dayId);
    if (!day || !/^\d{2}:\d{2}$/.test(slot)) return null;
    const startsAt = new Date(`${day.date}T${slot}:00`);
    if (Number.isNaN(startsAt.getTime())) return null;
    return { startsAt, endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000), floating: true };
  }
  return null;
}

export function googleCalendarUrl(event: BoraEvent, details: CalendarDetails) {
  const format = details.floating ? formatFloating : formatUtc;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${format(details.startsAt)}/${format(details.endsAt)}`, location: event.place, details: event.description || 'Convite criado no Bora.' });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function calendarIcs(event: BoraEvent, details: CalendarDetails) {
  const format = details.floating ? formatFloating : formatUtc;
  const utcSuffix = details.floating ? '' : 'Z';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bora//Convite//PT-BR', 'BEGIN:VEVENT', `UID:bora-${event.id}@bora-app`, `DTSTAMP:${formatUtc(new Date())}`, `DTSTART:${format(details.startsAt)}${utcSuffix}`, `DTEND:${format(details.endsAt)}${utcSuffix}`, `SUMMARY:${escapeIcs(event.title)}`, `LOCATION:${escapeIcs(event.place)}`, `DESCRIPTION:${escapeIcs(event.description || 'Convite criado no Bora.')}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
