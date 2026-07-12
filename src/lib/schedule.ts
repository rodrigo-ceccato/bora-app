import type { ScheduleDay } from './types';

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function slugify(title: string) {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'bora';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultDays(): ScheduleDay[] {
  const today = new Date();
  return [0, 1, 2].map((offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const iso = date.toISOString().slice(0, 10);
    return {
      id: uid('day'),
      label: date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      date: iso,
      slots: ['18:00', '19:00', '20:00', '21:00']
    };
  });
}

export function normalizeLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function responseLabel(response: string) {
  if (response === 'accept') return 'Topo';
  if (response === 'decline') return 'Não vou';
  return 'Talvez';
}
