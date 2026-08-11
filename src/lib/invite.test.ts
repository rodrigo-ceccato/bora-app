import { afterEach, describe, expect, it, vi } from 'vitest';
import { invitationDateTime, invitationText, invitationWhen } from './invite';
import type { BoraEvent } from './types';

function event(overrides: Partial<BoraEvent>): BoraEvent {
  return {
    id: 'evt_1', slug: 'teste', mode: 'agora', title: 'Chopp', place: 'Bar do Zé', threshold: 2,
    startsAt: '2026-08-08T14:30:00', alternatives: [], days: [],
    votingClosed: false, createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

describe('invitationWhen', () => {
  it('formats agora events with the weekday and time without throwing', () => {
    expect(invitationWhen(event({ mode: 'agora' }))).toMatch(/^(segunda|terça|quarta|quinta|sexta|sábado|domingo), \d{1,2} de agosto/);
  });

  it('lists each day and its slots for marcar events', () => {
    const when = invitationWhen(event({
      mode: 'marcar', startsAt: undefined, alternatives: [],
      days: [{ id: 'd1', label: 'sáb, 08/08', date: '2026-08-08', slots: ['18:00', '19:00'] }]
    }));
    expect(when).toContain('18:00');
    expect(when).toContain('19:00');
    expect(when).toContain(': ');
  });

  it('joins the offered options for mais-tarde events', () => {
    const when = invitationWhen(event({
      mode: 'mais-tarde',
      startsAt: '2026-08-08T19:00:00.000Z',
      alternatives: ['2026-08-09T19:00:00.000Z']
    }));
    expect(when).toContain(' ou ');
    expect(when).toMatch(/2026/);
  });

  it('falls back when nothing is scheduled', () => {
    expect(invitationWhen(event({ mode: 'marcar', startsAt: undefined, days: [] }))).toBe('Dias e horários a combinar');
    expect(invitationWhen(event({ mode: 'mais-tarde', startsAt: undefined, alternatives: [] }))).toBe('Data e horário a combinar');
  });
});

describe('invitationText', () => {
  it('includes title, when, place and the confirmation line', () => {
    const text = invitationText(event({ mode: 'agora', startsAt: '2026-08-08T14:30:00' }));
    expect(text).toContain('Bora? Chopp');
    expect(text).toContain('📅');
    expect(text).toContain('📍 Bar do Zé');
    expect(text).toContain('Confirma sua presença no Bora:');
  });

  it('uses the compact Bora share format, including Hoje and the nearest clock face', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
    const scheduled = event({
      mode: 'marcar', startsAt: undefined, alternatives: [], timeZone: 'America/Sao_Paulo', decidedOption: 'segunda:18:07',
      days: [{ id: 'segunda', label: 'segunda', date: '2026-08-10', slots: ['18:07'] }]
    });
    expect(invitationDateTime(scheduled)).toEqual({
      date: '📅 Hoje, segunda-feira, 10 de agosto',
      time: '🕕 às 18:07'
    });
    expect(invitationText(scheduled)).toContain('Bora? Chopp\n\n📅 Hoje, segunda-feira, 10 de agosto\n🕕 às 18:07\n📍 Bar do Zé');
  });

  afterEach(() => vi.useRealTimers());

  it('keeps an optional description as its own block before confirmation', () => {
    const text = invitationText(event({ mode: 'agora', description: 'Levar refrigerante' }));
    expect(text).toContain('📍 Bar do Zé\n\nLevar refrigerante\n\nConfirma sua presença no Bora:');
  });
});
