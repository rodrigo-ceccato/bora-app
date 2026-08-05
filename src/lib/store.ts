import type { BoraEvent, BoraVote, EventDraft, EventWithVotes } from './types';
import { slugify, uid } from './schedule';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const LOCAL_EVENTS_KEY = 'bora_events_v2';
const PARTICIPANT_KEY = 'bora_participant_id';
const PARTICIPANT_NAME_KEY = 'bora_participant_name';
const ADMIN_EVENTS_KEY = 'bora_admin_events';

function notifyParticipantNameChange() {
  window.dispatchEvent(new Event('bora:participant-name-updated'));
}

export interface AdminEventAccess {
  slug: string;
  title: string;
  adminToken: string;
}

type ApiEventResponse = EventWithVotes & { adminToken?: string };

export interface MyEvents {
  created: BoraEvent[];
  joined: BoraEvent[];
}

function readLocal(): EventWithVotes[] {
  const items = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]') as EventWithVotes[];
  return items.map((item) => ({
    ...item,
    votes: item.votes.map((vote) => ({
      ...vote,
      preferredOptions: Array.isArray(vote.preferredOptions)
        ? vote.preferredOptions
        : (vote as BoraVote & { preferredOption?: string }).preferredOption
          ? [(vote as BoraVote & { preferredOption?: string }).preferredOption!]
          : []
    }))
  }));
}

function writeLocal(items: EventWithVotes[]) {
  localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(items));
}

function rememberAdminEvent(event: BoraEvent, adminToken: string) {
  const current = JSON.parse(localStorage.getItem(ADMIN_EVENTS_KEY) || '[]') as Array<{
    slug: string;
    title: string;
    adminToken: string;
  }>;
  const next = [
    { slug: event.slug, title: event.title, adminToken },
    ...current.filter((item) => item.slug !== event.slug)
  ].slice(0, 30);
  localStorage.setItem(ADMIN_EVENTS_KEY, JSON.stringify(next));
}

export function getParticipantId() {
  const existing = localStorage.getItem(PARTICIPANT_KEY);
  if (existing) return existing;
  const participantId = uid('participant');
  localStorage.setItem(PARTICIPANT_KEY, participantId);
  return participantId;
}

export function hasRegisteredParticipant() {
  return Boolean(localStorage.getItem(PARTICIPANT_KEY));
}

export function restoreParticipantId(participantId: string) {
  localStorage.setItem(PARTICIPANT_KEY, participantId);
}

export function clearDeviceAuthentication() {
  localStorage.removeItem(PARTICIPANT_KEY);
  localStorage.removeItem(PARTICIPANT_NAME_KEY);
  localStorage.removeItem(ADMIN_EVENTS_KEY);
  localStorage.removeItem(LOCAL_EVENTS_KEY);
  notifyParticipantNameChange();
}

export function getParticipantName() {
  return (localStorage.getItem(PARTICIPANT_NAME_KEY) || '').trim();
}

export function saveParticipantName(name: string) {
  const value = name.trim().slice(0, 80);
  if (value) localStorage.setItem(PARTICIPANT_NAME_KEY, value);
  else localStorage.removeItem(PARTICIPANT_NAME_KEY);
  notifyParticipantNameChange();
}

export function restoreParticipantName(name: string) {
  saveParticipantName(name);
}

export function usingApi() {
  return Boolean(API_BASE);
}

export function listAdminEvents(): AdminEventAccess[] {
  return JSON.parse(localStorage.getItem(ADMIN_EVENTS_KEY) || '[]') as AdminEventAccess[];
}

export function restoreAdminEvents(events: AdminEventAccess[]) {
  const validEvents = events.filter((event) =>
    typeof event.slug === 'string' && typeof event.title === 'string' && typeof event.adminToken === 'string'
      && event.slug.length > 0 && event.adminToken.length > 0
  ).slice(0, 30);
  const existing = listAdminEvents();
  const merged = [...validEvents, ...existing.filter((event) => !validEvents.some((item) => item.slug === event.slug))];
  localStorage.setItem(ADMIN_EVENTS_KEY, JSON.stringify(merged.slice(0, 30)));
}

export async function listMyEvents(): Promise<MyEvents> {
  if (API_BASE) {
    return apiRequest<MyEvents>('/me/events', {
      headers: { 'x-participant-id': getParticipantId() }
    });
  }
  const items = readLocal();
  return {
    created: items.filter((item) => item.isAdmin).map((item) => item.event),
    joined: items.filter((item) => !item.isAdmin).map((item) => item.event)
  };
}

export async function createRecoveryLink(includeAdminAccess = false): Promise<string> {
  const result = await apiRequest<{ recoveryToken: string }>('/me/recovery-link', {
    method: 'POST', headers: { 'x-participant-id': getParticipantId() }
  });
  const link = `${window.location.origin}/recover?token=${encodeURIComponent(result.recoveryToken)}`;
  // The fragment is never sent to the server, which keeps these capabilities out of server logs.
  const fragment = new URLSearchParams();
  if (includeAdminAccess) fragment.set('admin', JSON.stringify(listAdminEvents()));
  const name = getParticipantName();
  if (name) fragment.set('name', name);
  return fragment.size ? `${link}#${fragment.toString()}` : link;
}

export async function recoverParticipant(recoveryToken: string): Promise<string> {
  const result = await apiRequest<{ participantId: string }>('/recover', {
    method: 'POST', body: JSON.stringify({ recoveryToken })
  });
  return result.participantId;
}

async function apiRequest<T>(path: string, init: RequestInit = {}, adminToken?: string): Promise<T> {
  if (!API_BASE) throw new Error('API não configurada.');
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      ...init.headers
    }
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body as T;
}

export function subscribeToEvent(_eventId: string, onChange: () => void) {
  if (!API_BASE) return () => undefined;
  const interval = window.setInterval(onChange, 12_000);
  return () => window.clearInterval(interval);
}

export async function createEvent(draft: EventDraft): Promise<BoraEvent> {
  const participantId = getParticipantId();
  if (API_BASE) {
    // Quem cria o Bora está disponível em todos os horários que ofereceu.
    const creatorPreferredOptions = draft.mode === 'mais-tarde'
      ? [draft.startsAt, ...draft.alternatives].filter((option): option is string => Boolean(option))
      : [];
    const result = await apiRequest<ApiEventResponse>('/events', {
      method: 'POST',
      body: JSON.stringify({ event: draft, participantId, creatorPreferredOptions })
    });
    if (!result.adminToken) throw new Error('O servidor não retornou o link de administrador.');
    rememberAdminEvent(result.event, result.adminToken);
    return { ...result.event, adminToken: result.adminToken };
  }

  const event: BoraEvent = {
    ...draft,
    id: uid('evt'),
    slug: slugify(draft.title),
    adminToken: uid('adm'),
    votingClosed: false,
    createdAt: new Date().toISOString()
  };
  const creatorVote: BoraVote = {
    id: uid('vote'),
    eventId: event.id,
    participantId,
    voterName: event.createdByName || '',
    response: 'accept',
    preferredOptions: event.mode === 'mais-tarde'
      ? [event.startsAt, ...event.alternatives].filter((option): option is string => Boolean(option))
      : [],
    availability: event.mode === 'marcar'
      ? Object.fromEntries(event.days.map((day) => [day.id, [...day.slots]]))
      : {},
    createdAt: event.createdAt
  };
  const items = readLocal();
  items.unshift({ event, votes: [creatorVote], isAdmin: true });
  writeLocal(items);
  rememberAdminEvent(event, event.adminToken!);
  return event;
}

export async function getEvent(slug: string, adminToken?: string): Promise<EventWithVotes | null> {
  if (API_BASE) {
    try {
      return await apiRequest<EventWithVotes>(`/events/${encodeURIComponent(slug)}`, {
        headers: { 'x-participant-id': getParticipantId() }
      }, adminToken);
    } catch (error) {
      if (error instanceof Error && error.message === 'Evento não encontrado.') return null;
      throw error;
    }
  }
  const item = readLocal().find((candidate) => candidate.event.slug === slug);
  if (!item) return null;
  return {
    ...item,
    isAdmin: Boolean(adminToken && adminToken === item.event.adminToken)
  };
}

export async function submitVote(
  event: BoraEvent,
  voteInput: Omit<BoraVote, 'id' | 'eventId' | 'participantId' | 'createdAt'>
): Promise<BoraVote> {
  if (event.votingClosed) throw new Error('A votação deste Bora foi encerrada.');
  const participantId = getParticipantId();

  if (API_BASE) {
    const result = await apiRequest<{ vote: BoraVote }>(`/events/${encodeURIComponent(event.slug)}/votes`, {
      method: 'POST',
      body: JSON.stringify({ ...voteInput, participantId })
    });
    return result.vote;
  }

  const vote: BoraVote = {
    ...voteInput,
    id: uid('vote'),
    eventId: event.id,
    participantId,
    createdAt: new Date().toISOString()
  };
  const items = readLocal();
  const item = items.find((candidate) => candidate.event.id === event.id);
  if (!item) throw new Error('Evento não encontrado.');
  item.votes = item.votes.filter((old) =>
    old.participantId !== participantId && old.voterName.toLocaleLowerCase() !== vote.voterName.toLocaleLowerCase()
  );
  item.votes.unshift(vote);
  writeLocal(items);
  return vote;
}

export async function updateEvent(adminToken: string, event: BoraEvent): Promise<BoraEvent> {
  if (API_BASE) {
    const result = await apiRequest<{ event: BoraEvent }>(`/events/${encodeURIComponent(event.slug)}`, {
      method: 'PATCH',
      body: JSON.stringify(event)
    }, adminToken);
    return result.event;
  }
  if (adminToken !== event.adminToken) throw new Error('Link de administrador inválido.');
  const items = readLocal();
  const index = items.findIndex((item) => item.event.id === event.id && item.event.adminToken === adminToken);
  if (index === -1) throw new Error('Evento não encontrado.');
  items[index].event = event;
  writeLocal(items);
  return event;
}

export async function deleteEvent(adminToken: string, event: BoraEvent): Promise<void> {
  if (API_BASE) {
    await apiRequest<void>(`/events/${encodeURIComponent(event.slug)}`, { method: 'DELETE' }, adminToken);
  } else {
    if (adminToken !== event.adminToken) throw new Error('Link de administrador inválido.');
    writeLocal(readLocal().filter((item) => item.event.id !== event.id));
  }
  const remembered = listAdminEvents().filter((item) => item.slug !== event.slug);
  localStorage.setItem(ADMIN_EVENTS_KEY, JSON.stringify(remembered));
}
