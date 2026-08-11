import type { ScheduleDay } from './types';
import { localDateKey } from './datetime';

export function uid(prefix = 'id') {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return `${prefix}_${cryptoApi.randomUUID().replace(/-/g, '')}`;
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  // Participant and local organizer IDs are bearer capabilities. Refuse to
  // mint a predictable fallback on an environment without secure randomness.
  throw new Error('Este navegador não oferece geração segura de identificadores.');
}

export function slugify(title: string) {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'bora';
  return `${base}-${uid('link').slice('link_'.length, 'link_'.length + 16)}`;
}

export function defaultDays(): ScheduleDay[] {
  const today = new Date();
  return [0, 1, 2].map((offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const iso = localDateKey(date);
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
