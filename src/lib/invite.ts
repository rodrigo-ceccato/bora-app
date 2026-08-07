import type { BoraEvent } from './types';
import { eventOptions, optionLabel } from './options';

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
  const details = [
    `📅 ${invitationWhen(event)}`,
    `📍 ${event.place}`,
    event.description ? `\n${event.description}` : '',
    '\nConfirma sua presença no Bora:'
  ].filter(Boolean);
  return `Bora? ${event.title}\n\n${details.join('\n')}`;
}
