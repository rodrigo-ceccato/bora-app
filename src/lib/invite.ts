import type { BoraEvent } from './types';
import { eventOptions, optionLabel } from './options';
import { calendarDetails } from './calendar';

const clockFaces = ['🕛', '🕧', '🕐', '🕜', '🕑', '🕝', '🕒', '🕞', '🕓', '🕟', '🕔', '🕠', '🕕', '🕡', '🕖', '🕢', '🕗', '🕣', '🕘', '🕤', '🕙', '🕥', '🕚', '🕦'];

function partsInZone(date: Date, timeZone?: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  return Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
}

function clockEmoji(hour: number, minute: number) {
  // Unicode has clock faces for whole and half hours. Round to the nearest one.
  const halfHour = (hour * 2 + (minute >= 15 && minute < 45 ? 1 : minute >= 45 ? 2 : 0)) % 24;
  return clockFaces[halfHour]!;
}

/** The compact, share-ready date/time lines for a Bora with a chosen instant. */
export function invitationDateTime(event: BoraEvent) {
  const details = calendarDetails(event);
  if (!details) return null;
  const timeZone = event.mode === 'marcar' ? event.timeZone : undefined;
  const value = partsInZone(details.startsAt, timeZone);
  const today = partsInZone(new Date(), timeZone);
  const sameDay = value.year === today.year && value.month === today.month && value.day === today.day;
  const date = details.startsAt.toLocaleDateString('pt-BR', {
    timeZone,
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  return {
    date: `📅 ${sameDay ? 'Hoje, ' : ''}${date}`,
    time: `${clockEmoji(hour, minute)} às ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}

/**
 * Human-readable "when" line for an event, as used in copied invites and
 * share messages. Keep locale options explicit: mixing `weekday` with
 * `dateStyle`/`timeStyle` makes V8 throw `TypeError: Invalid option`.
 */
export function invitationWhen(event: BoraEvent) {
  if (event.mode === 'marcar') {
    return event.days.length
      ? event.days.map((day) => `${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}: ${day.slots.join(', ')}`).join('\n')
      : 'Dias e horários a combinar';
  }
  if (event.mode === 'agora' && event.startsAt) {
    return new Date(event.startsAt).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  }
  if (event.startsAt) {
    return eventOptions(event).map((option) => optionLabel(event, option.id)).join(' ou ');
  }
  return 'Data e horário a combinar';
}

export function invitationText(event: BoraEvent) {
  const dateTime = invitationDateTime(event);
  const details = [
    ...(dateTime ? [dateTime.date, dateTime.time] : [`📅 ${invitationWhen(event)}`]),
    `📍 ${event.place}`,
    ...(event.description ? [`\n${event.description}`] : []),
    '\nConfirma sua presença no Bora:'
  ];
  return `Bora? ${event.title}\n\n${details.join('\n')}`;
}
