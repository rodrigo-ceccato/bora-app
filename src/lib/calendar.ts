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

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
}

/** Resolves an event-local wall clock to an instant without using the viewer's zone. */
export function calendarZonedDateTime(dateKey: string, clockTime: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clockTime)) return null;
  let zone: string;
  try {
    zone = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = clockTime.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = zonedParts(new Date(instant), zone);
    const renderedClock = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);
    const correction = target - renderedClock;
    instant += correction;
    if (correction === 0) break;
  }
  const result = new Date(instant);
  const rendered = zonedParts(result, zone);
  if (rendered.year !== year || rendered.month !== month || rendered.day !== day
    || rendered.hour !== hour || rendered.minute !== minute) return null;
  return result;
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    const limit = chunks.length === 0 ? 75 : 74;
    if (chunk && chunkBytes + characterBytes > limit) {
      chunks.push(chunk);
      chunk = character;
      chunkBytes = characterBytes;
    } else {
      chunk += character;
      chunkBytes += characterBytes;
    }
  }
  chunks.push(chunk);
  return chunks.join('\r\n ');
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
    const startsAt = event.timeZone
      ? calendarZonedDateTime(day.date, slot, event.timeZone)
      : new Date(`${day.date}T${slot}:00`);
    if (!startsAt) return null;
    if (Number.isNaN(startsAt.getTime())) return null;
    return { startsAt, endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000), floating: !event.timeZone };
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
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bora//Convite//PT-BR', 'BEGIN:VEVENT', `UID:bora-${event.id}@bora-app`, `DTSTAMP:${formatUtc(new Date())}`, `DTSTART:${format(details.startsAt)}`, `DTEND:${format(details.endsAt)}`, `SUMMARY:${escapeIcs(event.title)}`, `LOCATION:${escapeIcs(event.place)}`, `DESCRIPTION:${escapeIcs(event.description || 'Convite criado no Bora.')}`, 'END:VEVENT', 'END:VCALENDAR', '']
    .map(foldIcsLine)
    .join('\r\n');
}
