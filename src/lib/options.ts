import type { BoraEvent } from './types';

export interface EventOption {
  id: string;
  label: string;
  primary?: boolean;
}

function formatOption(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Option ids are data; labels are only presentation. */
export function eventOptions(event: BoraEvent): EventOption[] {
  if (event.mode === 'mais-tarde') {
    return [event.startsAt, ...event.alternatives]
      .filter((value): value is string => Boolean(value))
      .map((value, index) => {
        const instant = !Number.isNaN(new Date(value).getTime());
        return { id: instant ? value : `legacy:${value}`, label: formatOption(value), primary: index === 0 };
      });
  }
  if (event.mode === 'marcar') {
    return event.days.flatMap((day) => day.slots.map((slot) => ({ id: `${day.id}:${slot}`, label: `${day.label} · ${slot}` })));
  }
  return [];
}

export function optionLabel(event: BoraEvent, id?: string) {
  if (!id) return '';
  return eventOptions(event).find((option) => option.id === id)?.label || id.replace(/^legacy:/, '');
}

export function optionIds(event: BoraEvent) {
  return new Set(eventOptions(event).map((option) => option.id));
}
