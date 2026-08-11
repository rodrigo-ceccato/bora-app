import type { BoraEvent, BoraMessage, BoraVote, EventDraft, EventSummary, EventWithVotes } from './types';
import { slugify, uid } from './schedule';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const LOCAL_EVENTS_KEY = 'bora_events_v2';
const PARTICIPANT_KEY = 'bora_participant_id';
const PARTICIPANT_NAME_KEY = 'bora_participant_name';
const ADMIN_EVENTS_KEY = 'bora_admin_events';
const MAX_EVENT_VOTES = 2000;
const DEFAULT_VOTE_PAGE_SIZE = 200;
const SESSION_OVERRIDE_PREFIX = 'bora_storage_override:';
const SESSION_TOMBSTONE_PREFIX = 'bora_storage_deleted:';
let pendingParticipantName: string | null = null;
let participantNameSyncInFlight: Promise<void> | null = null;
let participantProfileRefreshInFlight: Promise<string> | null = null;
let lastProfileRefreshAt = 0;

export type StoragePersistence = 'persistent' | 'session' | 'memory';

function eventMessagesClosed(event: BoraEvent) {
  if (event.startsAt && new Date(event.startsAt).getTime() <= Date.now()) return true;
  if (event.mode === 'marcar' && event.days.length) {
    const latestDay = event.days.map((day) => day.date).sort().at(-1);
    return Boolean(latestDay && latestDay < new Date().toISOString().slice(0, 10));
  }
  return false;
}

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const memoryStorage = new Map<string, string>();
const storageTierOverrides = new Map<string, StoragePersistence>();
const storageTombstones = new Set<string>();

function browserStorage(kind: 'local' | 'session'): Storage | undefined {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return undefined;
  }
}

function storageValues(key: string): Array<{ value: string; persistence: StoragePersistence }> {
  const values: Array<{ value: string; persistence: StoragePersistence }> = [];
  const local = browserStorage('local');
  const session = browserStorage('session');
  let tombstoned = storageTombstones.has(key);
  try { tombstoned ||= session?.getItem(`${SESSION_TOMBSTONE_PREFIX}${key}`) === '1'; } catch { /* The in-memory tombstone still protects this page. */ }
  if (tombstoned) return values;
  let sessionOverridesLocal = storageTierOverrides.get(key) === 'session';
  try {
    sessionOverridesLocal ||= session?.getItem(`${SESSION_OVERRIDE_PREFIX}${key}`) === '1';
    const value = session?.getItem(key);
    if (sessionOverridesLocal && value !== null && value !== undefined) values.push({ value, persistence: 'session' });
  } catch { /* Try the in-memory fallback. */ }
  try {
    const value = local?.getItem(key);
    if (value !== null && value !== undefined) values.push({ value, persistence: 'persistent' });
  } catch { /* Try the next storage tier. */ }
  if (!sessionOverridesLocal) {
    try {
      const value = session?.getItem(key);
      if (value !== null && value !== undefined) values.push({ value, persistence: 'session' });
    } catch { /* Try the in-memory fallback. */ }
  }
  const value = memoryStorage.get(key);
  if (value !== undefined) {
    if (storageTierOverrides.get(key) === 'memory') values.unshift({ value, persistence: 'memory' });
    else values.push({ value, persistence: 'memory' });
  }
  return values;
}

function readStored(key: string) {
  return storageValues(key)[0]?.value || null;
}

function normalizedParticipantId(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized && normalized.length <= 100 ? normalized : '';
}

function writeStored(key: string, value: string): StoragePersistence {
  const local = browserStorage('local');
  try {
    local?.setItem(key, value);
    if (local) {
      try { browserStorage('session')?.removeItem(key); } catch { /* The durable value still succeeded. */ }
      try { browserStorage('session')?.removeItem(`${SESSION_OVERRIDE_PREFIX}${key}`); } catch { /* Marker is advisory. */ }
      try { browserStorage('session')?.removeItem(`${SESSION_TOMBSTONE_PREFIX}${key}`); } catch { /* A new durable write takes precedence in this page. */ }
      memoryStorage.delete(key);
      storageTierOverrides.delete(key);
      storageTombstones.delete(key);
      return 'persistent';
    }
  } catch { /* Fall back to session storage. */ }

  const session = browserStorage('session');
  try {
    session?.setItem(key, value);
    if (session) {
      storageTierOverrides.set(key, 'session');
      try { session.setItem(`${SESSION_OVERRIDE_PREFIX}${key}`, '1'); } catch { /* In-memory override still applies this page. */ }
      try { session.removeItem(`${SESSION_TOMBSTONE_PREFIX}${key}`); } catch { /* A new write takes precedence in this page. */ }
      try { local?.removeItem(key); } catch { /* The override marker prevents a stale durable read. */ }
      memoryStorage.delete(key);
      storageTombstones.delete(key);
      return 'session';
    }
  } catch { /* Fall back to memory for this page lifetime. */ }

  memoryStorage.set(key, value);
  storageTierOverrides.set(key, 'memory');
  storageTombstones.delete(key);
  return 'memory';
}

function removeStored(key: string) {
  const local = browserStorage('local');
  const session = browserStorage('session');
  let localRemoved = !local;
  let sessionRemoved = !session;
  try {
    local?.removeItem(key);
    localRemoved = !local || local.getItem(key) === null;
  } catch { /* Continue clearing other tiers. */ }
  try {
    session?.removeItem(key);
    session?.removeItem(`${SESSION_OVERRIDE_PREFIX}${key}`);
    sessionRemoved = !session || (session.getItem(key) === null && session.getItem(`${SESSION_OVERRIDE_PREFIX}${key}`) === null);
  } catch { /* Continue clearing memory. */ }
  memoryStorage.delete(key);
  storageTierOverrides.delete(key);
  const complete = localRemoved && sessionRemoved;
  if (!complete) {
    // Prefer a deletion marker over accidentally resurrecting a readable but
    // non-removable bearer capability on the next render.
    storageTombstones.add(key);
    try { session?.setItem(`${SESSION_TOMBSTONE_PREFIX}${key}`, '1'); } catch { /* The in-memory marker is still safer than stale data. */ }
  } else {
    storageTombstones.delete(key);
    try { session?.removeItem(`${SESSION_TOMBSTONE_PREFIX}${key}`); } catch { /* All data keys were already removed. */ }
  }
  return complete;
}

export function saveSessionPreference(key: string, value: string) {
  try {
    const session = browserStorage('session');
    if (!session) return false;
    session.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readArray<T>(key: string, valid: (value: unknown) => value is T): T[] {
  for (const stored of storageValues(key)) {
    try {
      const parsed = JSON.parse(stored.value) as unknown;
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(valid);
        if (parsed.length === 0 || filtered.length > 0) return filtered;
      }
    } catch { /* A corrupt tier must not hide a valid fallback tier. */ }
  }
  return [];
}

function leastDurable(...values: StoragePersistence[]): StoragePersistence {
  if (values.includes('memory')) return 'memory';
  if (values.includes('session')) return 'session';
  return 'persistent';
}

function notifyParticipantNameChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bora:participant-name-updated'));
}

export interface AdminEventAccess {
  slug: string;
  title: string;
  adminToken: string;
}

type ApiEventResponse = EventWithVotes & { adminToken?: string };

export type CreatedEvent = BoraEvent & { adminAccessPersistence: StoragePersistence };

export interface MyEvents {
  created: EventSummary[];
  joined: EventSummary[];
}

function readLocal(): EventWithVotes[] {
  for (const stored of storageValues(LOCAL_EVENTS_KEY)) {
    try {
      const parsed = JSON.parse(stored.value) as unknown;
      if (!Array.isArray(parsed)) continue;
      const normalized = parsed.map(normalizeStoredEventWithVotes)
        .filter((item): item is EventWithVotes => Boolean(item));
      // As with the other storage tiers, a wholly corrupt durable array must
      // not hide a valid session or memory fallback.
      if (parsed.length === 0 || normalized.length > 0) return normalized;
    } catch { /* Try the next storage tier. */ }
  }
  return [];
}

const storedModes = new Set(['agora', 'mais-tarde', 'marcar']);
const storedResponses = new Set(['accept', 'decline', 'maybe']);

function stringArray(value: unknown, maxLength: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length <= maxLength)
    : [];
}

function normalizeStoredEvent(value: unknown): BoraEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Partial<BoraEvent>;
  if (typeof event.id !== 'string' || !event.id || typeof event.slug !== 'string' || !event.slug
    || typeof event.title !== 'string' || typeof event.place !== 'string'
    || typeof event.mode !== 'string' || !storedModes.has(event.mode)
    || !Number.isInteger(event.threshold) || Number(event.threshold) < 2
    || typeof event.votingClosed !== 'boolean' || typeof event.createdAt !== 'string') return null;

  const days = Array.isArray(event.days) ? event.days.map((day) => {
    if (!day || typeof day !== 'object' || Array.isArray(day)) return null;
    if (typeof day.id !== 'string' || !day.id || typeof day.label !== 'string'
      || typeof day.date !== 'string' || !Array.isArray(day.slots)
      || day.slots.some((slot) => typeof slot !== 'string')) return null;
    return { id: day.id, label: day.label, date: day.date, slots: stringArray(day.slots, 5) };
  }) : [];
  if (days.some((day) => !day)) return null;
  if ((event.mode === 'agora' || event.mode === 'mais-tarde') && typeof event.startsAt !== 'string') return null;
  if (event.mode === 'marcar' && days.length === 0) return null;

  const startsAt = typeof event.startsAt === 'string' ? event.startsAt : undefined;
  const timeZone = (() => {
    if (typeof event.timeZone !== 'string' || event.timeZone.length > 100) return undefined;
    try { return new Intl.DateTimeFormat('en-US', { timeZone: event.timeZone }).resolvedOptions().timeZone; }
    catch { return undefined; }
  })();
  return {
    id: event.id,
    slug: event.slug,
    mode: event.mode as BoraEvent['mode'],
    title: event.title,
    place: event.place,
    ...(typeof event.description === 'string' ? { description: event.description.slice(0, 1000) } : {}),
    threshold: Number(event.threshold),
    ...(startsAt ? { startsAt } : {}),
    alternatives: stringArray(event.alternatives, 200),
    days: days as BoraEvent['days'],
    ...(timeZone ? { timeZone } : {}),
    ...(typeof event.createdByName === 'string' ? { createdByName: event.createdByName.slice(0, 80) } : {}),
    ...(typeof event.notifyCreatorOnVote === 'boolean' ? { notifyCreatorOnVote: event.notifyCreatorOnVote } : {}),
    votingClosed: event.votingClosed,
    ...(typeof event.decidedOption === 'string' && event.decidedOption.length <= 200 ? { decidedOption: event.decidedOption } : {}),
    ...(typeof event.decidedAt === 'string' ? { decidedAt: event.decidedAt } : {}),
    ...(typeof event.adminToken === 'string' && event.adminToken.length <= 200 ? { adminToken: event.adminToken } : {}),
    ...(Number.isInteger(event.revision) && Number(event.revision) >= 0 ? { revision: Number(event.revision) } : {}),
    createdAt: event.createdAt
  };
}

function normalizeStoredVote(value: unknown, eventId: string): BoraVote | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const vote = value as Partial<BoraVote> & { preferredOption?: unknown };
  if (typeof vote.id !== 'string' || !vote.id || vote.eventId !== eventId
    || typeof vote.voterName !== 'string' || typeof vote.response !== 'string'
    || !storedResponses.has(vote.response) || typeof vote.createdAt !== 'string') return null;

  const availability: Record<string, string[]> = {};
  if (vote.availability && typeof vote.availability === 'object' && !Array.isArray(vote.availability)) {
    for (const [dayId, slots] of Object.entries(vote.availability)) {
      if (dayId.length <= 100 && Array.isArray(slots)) availability[dayId] = stringArray(slots, 5);
    }
  }
  const legacyPreference = typeof vote.preferredOption === 'string' ? [vote.preferredOption] : [];
  const preferredOptions = stringArray(vote.preferredOptions, 200);
  return {
    id: vote.id,
    eventId,
    ...(typeof vote.participantId === 'string' && vote.participantId.length <= 100
      ? { participantId: vote.participantId }
      : {}),
    ...(typeof vote.isOwn === 'boolean' ? { isOwn: vote.isOwn } : {}),
    voterName: vote.voterName,
    response: vote.response as BoraVote['response'],
    preferredOptions: preferredOptions.length ? preferredOptions : legacyPreference,
    availability,
    createdAt: vote.createdAt
  };
}

function normalizeStoredEventWithVotes(value: unknown): EventWithVotes | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Partial<EventWithVotes>;
  const event = normalizeStoredEvent(item.event);
  if (!event || !Array.isArray(item.votes)) return null;
  return {
    event,
    votes: item.votes.map((vote) => normalizeStoredVote(vote, event.id))
      .filter((vote): vote is BoraVote => Boolean(vote)),
    ...(normalizeStoredVote(item.ownVote, event.id) ? { ownVote: normalizeStoredVote(item.ownVote, event.id)! } : {}),
    isAdmin: item.isAdmin === true
  };
}

function writeLocal(items: EventWithVotes[]) {
  return writeStored(LOCAL_EVENTS_KEY, JSON.stringify(items));
}

function rememberAdminEvent(event: BoraEvent, adminToken: string) {
  const current = listAdminEvents();
  const next = [
    { slug: event.slug, title: event.title, adminToken },
    ...current.filter((item) => item.slug !== event.slug)
  ];
  return writeStored(ADMIN_EVENTS_KEY, JSON.stringify(next));
}

export function getParticipantId() {
  const existing = storageValues(PARTICIPANT_KEY)
    .map(({ value }) => normalizedParticipantId(value))
    .find(Boolean);
  if (existing) return existing;
  const participantId = uid('participant');
  writeStored(PARTICIPANT_KEY, participantId);
  return participantId;
}

export function hasRegisteredParticipant() {
  return storageValues(PARTICIPANT_KEY).some(({ value }) => Boolean(normalizedParticipantId(value)));
}

export function restoreParticipantId(participantId: string) {
  const normalized = normalizedParticipantId(participantId);
  if (!normalized) throw new Error('Identidade de participante inválida.');
  return writeStored(PARTICIPANT_KEY, normalized);
}

export function clearDeviceAuthentication() {
  const participant = removeStored(PARTICIPANT_KEY);
  const participantName = removeStored(PARTICIPANT_NAME_KEY);
  const adminEvents = removeStored(ADMIN_EVENTS_KEY);
  const events = removeStored(LOCAL_EVENTS_KEY);
  notifyParticipantNameChange();
  return { participant, participantName, adminEvents, events, complete: participant && participantName && adminEvents && events };
}

export function getParticipantName() {
  return (readStored(PARTICIPANT_NAME_KEY) || '').trim().slice(0, 80);
}

function cacheParticipantName(name: string) {
  const value = name.trim().slice(0, 80);
  if (value) writeStored(PARTICIPANT_NAME_KEY, value);
  else removeStored(PARTICIPANT_NAME_KEY);
  notifyParticipantNameChange();
  return value;
}

function profileSyncFailed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bora:participant-name-sync-failed'));
}

export async function syncParticipantName() {
  if (!API_BASE || !pendingParticipantName) return;
  if (participantNameSyncInFlight) return participantNameSyncInFlight;
  const name = pendingParticipantName;
  participantNameSyncInFlight = apiRequest<{ name: string }>('/me/profile', {
    method: 'PUT',
    headers: { 'x-participant-id': getParticipantId() },
    body: JSON.stringify({ name })
  }).then((profile) => {
    // Do not let an older response win after a newer local edit.
    if (pendingParticipantName === name) {
      pendingParticipantName = null;
      cacheParticipantName(profile.name);
    }
  }).catch((error) => {
    profileSyncFailed();
    throw error;
  }).finally(() => {
    participantNameSyncInFlight = null;
    // Input handlers can update the cache several times while a request is in
    // flight. Persist the newest value next instead of leaving it queued.
    if (pendingParticipantName && pendingParticipantName !== name) void syncParticipantName().catch(() => undefined);
  });
  return participantNameSyncInFlight;
}

/** Updates the immediate local cache, then persists the canonical profile. */
export function saveParticipantName(name: string) {
  const value = cacheParticipantName(name);
  // An empty cache is allowed while editing, but the server profile always
  // requires a display name and therefore is not overwritten with an empty value.
  if (value) {
    pendingParticipantName = value;
    void syncParticipantName().catch(() => undefined);
  }
  return value;
}

export function restoreParticipantName(name: string) {
  cacheParticipantName(name);
}

export function refreshParticipantProfile({ force = false } = {}) {
  if (!API_BASE) return getParticipantName();
  const now = Date.now();
  if (!force && now - lastProfileRefreshAt < 750) return getParticipantName();
  if (participantProfileRefreshInFlight) return participantProfileRefreshInFlight;
  lastProfileRefreshAt = now;
  participantProfileRefreshInFlight = (async () => {
    // A local offline edit should get a chance to reach the server before a
    // stale profile response can replace the visible cached value.
    if (pendingParticipantName) await syncParticipantName().catch(() => undefined);
    try {
      const profile = await apiRequest<{ name?: string }>('/me/profile', {
        headers: { 'x-participant-id': getParticipantId() }
      });
      if (profile.name) cacheParticipantName(profile.name);
    } catch {
      // The cache intentionally remains usable offline.
    }
    return getParticipantName();
  })();
  return participantProfileRefreshInFlight.finally(() => { participantProfileRefreshInFlight = null; });
}

/** Refreshes only on meaningful app activity; it deliberately does not poll. */
export function startParticipantProfileSync() {
  const refresh = () => { void refreshParticipantProfile(); };
  const focus = () => { void refreshParticipantProfile({ force: true }); };
  const visible = () => { if (document.visibilityState === 'visible') void refreshParticipantProfile({ force: true }); };
  refresh();
  window.addEventListener('focus', focus);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', visible);
  return () => {
    window.removeEventListener('focus', focus);
    window.removeEventListener('online', refresh);
    document.removeEventListener('visibilitychange', visible);
  };
}

export function usingApi() {
  return Boolean(API_BASE);
}

export function listAdminEvents(): AdminEventAccess[] {
  return readArray<AdminEventAccess>(ADMIN_EVENTS_KEY, (value): value is AdminEventAccess => {
    if (!value || typeof value !== 'object') return false;
    const event = value as Partial<AdminEventAccess>;
    return typeof event.slug === 'string' && event.slug.length > 0
      && typeof event.title === 'string'
      && typeof event.adminToken === 'string' && event.adminToken.length > 0;
  });
}

export function restoreAdminEvents(events: AdminEventAccess[]) {
  const validEvents = events.filter((event) =>
    typeof event.slug === 'string' && typeof event.title === 'string' && typeof event.adminToken === 'string'
      && event.slug.length > 0 && event.adminToken.length > 0
  );
  const existing = listAdminEvents();
  const merged = [...validEvents, ...existing.filter((event) => !validEvents.some((item) => item.slug === event.slug))];
  return writeStored(ADMIN_EVENTS_KEY, JSON.stringify(merged));
}

export async function listMyEvents(): Promise<MyEvents> {
  if (API_BASE) {
    return apiRequest<MyEvents>('/me/events', {
      headers: { 'x-participant-id': getParticipantId() }
    });
  }
  const items = readLocal();
  const summarize = (item: EventWithVotes): EventSummary => {
    const ownVote = item.votes.find((vote) => vote.participantId === getParticipantId());
    return {
      ...item.event,
      confirmedCount: item.votes.filter((vote) => vote.response === 'accept').length,
      participantResponse: ownVote?.response
    };
  };
  return {
    created: items.filter((item) => item.isAdmin).map(summarize),
    joined: items.filter((item) => !item.isAdmin).map(summarize)
  };
}

export async function createRecoveryLink(includeAdminAccess = true): Promise<string> {
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
  if (!response.ok) throw new ApiRequestError(body.error || 'Não foi possível concluir a operação.', response.status);
  return body as T;
}

export async function collectEventVotePages(
  firstPage: EventWithVotes,
  fetchPage: (cursor: string, limit: number) => Promise<EventWithVotes>
): Promise<EventWithVotes> {
  const votes = [...firstPage.votes];
  const seenVoteIds = new Set(votes.map((vote) => vote.id));
  const seenCursors = new Set<string>();
  let cursor = firstPage.votePage?.nextCursor;
  let serverHasMore = Boolean(firstPage.votePage?.hasMore);
  while (serverHasMore && cursor && !seenCursors.has(cursor) && votes.length < MAX_EVENT_VOTES) {
    seenCursors.add(cursor);
    const remaining = MAX_EVENT_VOTES - votes.length;
    const page = await fetchPage(cursor, Math.min(500, remaining));
    if (page.event.id !== firstPage.event.id) throw new Error('A paginação de votos retornou outro evento.');
    for (const vote of page.votes) {
      if (!seenVoteIds.has(vote.id)) {
        seenVoteIds.add(vote.id);
        votes.push(vote);
      }
    }
    const pageInfo = page.votePage;
    serverHasMore = Boolean(pageInfo?.hasMore);
    if (!serverHasMore) break;
    cursor = pageInfo?.nextCursor;
  }
  const votesTruncated = serverHasMore
    || (firstPage.voteSummary?.total !== undefined && firstPage.voteSummary.total > votes.length);
  return {
    ...firstPage,
    votes,
    votesTruncated,
    votePage: firstPage.votePage ? {
      ...firstPage.votePage,
      returned: votes.length,
      hasMore: votesTruncated,
      nextCursor: serverHasMore ? cursor : undefined
    } : undefined
  };
}

export function subscribeToEvent(_eventId: string, onChange: () => void) {
  if (!API_BASE) return () => undefined;
  const interval = window.setInterval(onChange, 12_000);
  return () => window.clearInterval(interval);
}

export async function createEvent(draft: EventDraft): Promise<CreatedEvent> {
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
    const adminAccessPersistence = rememberAdminEvent(result.event, result.adminToken);
    return { ...result.event, adminToken: result.adminToken, adminAccessPersistence };
  }

  const event: BoraEvent = {
    ...draft,
    id: uid('evt'),
    slug: slugify(draft.title),
    adminToken: uid('adm'),
    notifyCreatorOnVote: draft.notifyCreatorOnVote !== false,
    revision: 0,
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
  const eventPersistence = writeLocal(items);
  const adminPersistence = rememberAdminEvent(event, event.adminToken!);
  return { ...event, adminAccessPersistence: leastDurable(eventPersistence, adminPersistence) };
}

export async function getEvent(slug: string, adminToken?: string): Promise<EventWithVotes | null> {
  if (API_BASE) {
    try {
      const eventPath = `/events/${encodeURIComponent(slug)}`;
      const firstPage = await apiRequest<EventWithVotes>(eventPath, {
        headers: { 'x-participant-id': getParticipantId() }
      }, adminToken);
      // Keep polling bounded: aggregate totals and the viewer's own vote are
      // exact, while additional public names are loaded only on request.
      return {
        ...firstPage,
        votesTruncated: firstPage.votesTruncated
          || Boolean(firstPage.votePage?.hasMore)
          || (firstPage.voteSummary?.total !== undefined && firstPage.voteSummary.total > firstPage.votes.length)
      };
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  }
  const item = readLocal().find((candidate) => candidate.event.slug === slug);
  if (!item) return null;
  return {
    ...item,
    ownVote: item.ownVote || item.votes.find((vote) => vote.participantId === getParticipantId()),
    isAdmin: Boolean(adminToken && adminToken === item.event.adminToken),
    messagesClosed: eventMessagesClosed(item.event)
  };
}

export async function getMoreEventVotes(slug: string, cursor: string, adminToken?: string): Promise<EventWithVotes | null> {
  if (!API_BASE) return null;
  try {
    return await apiRequest<EventWithVotes>(
      `/events/${encodeURIComponent(slug)}?votesCursor=${encodeURIComponent(cursor)}&votesLimit=${DEFAULT_VOTE_PAGE_SIZE}&includeVoteSummary=0`,
      { headers: { 'x-participant-id': getParticipantId() } },
      adminToken
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
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

export async function submitMessage(event: BoraEvent, body: string): Promise<BoraMessage> {
  if (eventMessagesClosed(event)) throw new Error('Este Bora já aconteceu; os recados estão encerrados.');
  const message = body.trim();
  if (!message) throw new Error('Escreva um recado antes de enviar.');
  if (message.length > 500) throw new Error('Use no máximo 500 caracteres.');
  if (!getParticipantName().trim()) throw new Error('Informe seu nome antes de deixar um recado.');
  if (API_BASE) {
    const result = await apiRequest<{ message: BoraMessage }>(`/events/${encodeURIComponent(event.slug)}/messages`, {
      method: 'POST',
      headers: { 'x-participant-id': getParticipantId() },
      body: JSON.stringify({ body: message, authorName: getParticipantName().trim() })
    });
    return result.message;
  }
  const item = readLocal().find((candidate) => candidate.event.id === event.id);
  if (!item) throw new Error('Evento não encontrado.');
  const created: BoraMessage = { id: uid('message'), authorName: getParticipantName().trim(), body: message, createdAt: new Date().toISOString(), isOwn: true };
  item.messages = [...(item.messages || []), created];
  writeLocal(readLocal().map((candidate) => candidate.event.id === event.id ? item : candidate));
  return created;
}

export async function deleteMessage(event: BoraEvent, messageId: string, adminToken?: string): Promise<void> {
  if (API_BASE) {
    await apiRequest<void>(`/events/${encodeURIComponent(event.slug)}/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }, adminToken);
    return;
  }
  const items = readLocal();
  const item = items.find((candidate) => candidate.event.id === event.id);
  if (!item) throw new Error('Evento não encontrado.');
  const target = item.messages?.find((message) => message.id === messageId);
  if (!target || (!adminToken && !target.isOwn)) throw new Error('Você não pode remover este recado.');
  item.messages = item.messages?.filter((message) => message.id !== messageId);
  writeLocal(items);
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
  const currentRevision = items[index].event.revision || 0;
  if ((event.revision || 0) !== currentRevision) {
    throw new Error('Este Bora foi alterado em outra tela. Recarregue antes de salvar novamente.');
  }
  const updated = { ...event, revision: currentRevision + 1 };
  items[index].event = updated;
  writeLocal(items);
  return updated;
}

export async function deleteEvent(adminToken: string, event: BoraEvent): Promise<void> {
  if (API_BASE) {
    await apiRequest<void>(`/events/${encodeURIComponent(event.slug)}`, { method: 'DELETE' }, adminToken);
  } else {
    if (adminToken !== event.adminToken) throw new Error('Link de administrador inválido.');
    writeLocal(readLocal().filter((item) => item.event.id !== event.id));
  }
  const remembered = listAdminEvents().filter((item) => item.slug !== event.slug);
  writeStored(ADMIN_EVENTS_KEY, JSON.stringify(remembered));
}
