import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BoraEvent, BoraVote, EventDraft, EventWithVotes } from './types';
import { slugify, uid } from './schedule';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project'));
const supabase: SupabaseClient | null = hasSupabase ? createClient(SUPABASE_URL!, SUPABASE_KEY!) : null;
const LOCAL_KEY = 'bora_events_v2';

type DbEvent = {
  id: string;
  slug: string;
  admin_token: string;
  mode: BoraEvent['mode'];
  title: string;
  place: string;
  description?: string | null;
  threshold?: number | null;
  starts_at?: string | null;
  alternatives?: string[] | null;
  days?: BoraEvent['days'] | null;
  created_by_name?: string | null;
  voting_closed?: boolean | null;
  created_at: string;
};

type DbVote = {
  id: string;
  event_id: string;
  voter_name: string;
  response: BoraVote['response'];
  preferred_option?: string | null;
  availability?: Record<string, string[]> | null;
  created_at: string;
};

function toDbEvent(event: BoraEvent) {
  return {
    id: event.id,
    slug: event.slug,
    admin_token: event.adminToken,
    mode: event.mode,
    title: event.title,
    place: event.place,
    description: event.description,
    threshold: event.threshold,
    starts_at: event.startsAt,
    alternatives: event.alternatives,
    days: event.days,
    created_by_name: event.createdByName,
    voting_closed: event.votingClosed,
    created_at: event.createdAt
  };
}

function fromDbEvent(row: DbEvent): BoraEvent {
  return {
    id: row.id,
    slug: row.slug,
    adminToken: row.admin_token,
    mode: row.mode,
    title: row.title,
    place: row.place,
    description: row.description || '',
    threshold: row.threshold || 1,
    startsAt: row.starts_at || undefined,
    alternatives: row.alternatives || [],
    days: row.days || [],
    createdByName: row.created_by_name || undefined,
    votingClosed: Boolean(row.voting_closed),
    createdAt: row.created_at
  };
}

function toDbVote(vote: BoraVote) {
  return {
    id: vote.id,
    event_id: vote.eventId,
    voter_name: vote.voterName,
    response: vote.response,
    preferred_option: vote.preferredOption,
    availability: vote.availability,
    created_at: vote.createdAt
  };
}

function fromDbVote(row: DbVote): BoraVote {
  return {
    id: row.id,
    eventId: row.event_id,
    voterName: row.voter_name,
    response: row.response,
    preferredOption: row.preferred_option || undefined,
    availability: row.availability || {},
    createdAt: row.created_at
  };
}

function readLocal(): EventWithVotes[] {
  return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
}

function writeLocal(items: EventWithVotes[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

export function usingSupabase() {
  return hasSupabase;
}

export async function createEvent(draft: EventDraft): Promise<BoraEvent> {
  const event: BoraEvent = {
    ...draft,
    id: uid('evt'),
    slug: slugify(draft.title),
    adminToken: uid('adm'),
    votingClosed: false,
    createdAt: new Date().toISOString()
  };

  if (supabase) {
    const { error } = await supabase.from('events').insert(toDbEvent(event));
    if (error) throw error;
  } else {
    const items = readLocal();
    items.unshift({ event, votes: [] });
    writeLocal(items);
  }
  return event;
}

export async function getEvent(slug: string): Promise<EventWithVotes | null> {
  if (supabase) {
    const { data: eventRow, error: eventError } = await supabase.from('events').select('*').eq('slug', slug).single();
    if (eventError || !eventRow) return null;
    const event = fromDbEvent(eventRow as DbEvent);
    const { data: voteRows, error: voteError } = await supabase.from('votes').select('*').eq('event_id', event.id).order('created_at', { ascending: false });
    if (voteError) throw voteError;
    return { event, votes: ((voteRows || []) as DbVote[]).map(fromDbVote) };
  }
  return readLocal().find((item) => item.event.slug === slug) || null;
}

export async function listCreatedEvents(): Promise<BoraEvent[]> {
  if (supabase) {
    const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return ((data || []) as DbEvent[]).map(fromDbEvent);
  }
  return readLocal().map((item) => item.event);
}

export async function submitVote(event: BoraEvent, voteInput: Omit<BoraVote, 'id' | 'eventId' | 'createdAt'>): Promise<BoraVote> {
  if (event.votingClosed) throw new Error('A votação deste Bora foi encerrada.');
  const vote: BoraVote = {
    ...voteInput,
    id: uid('vote'),
    eventId: event.id,
    createdAt: new Date().toISOString()
  };

  if (supabase) {
    const { error } = await supabase.from('votes').insert(toDbVote(vote));
    if (error) throw error;
  } else {
    const items = readLocal();
    const item = items.find((candidate) => candidate.event.id === event.id);
    if (!item) throw new Error('Evento não encontrado');
    item.votes = item.votes.filter((old) => old.voterName.toLowerCase() !== vote.voterName.toLowerCase());
    item.votes.unshift(vote);
    writeLocal(items);
  }
  return vote;
}

export async function updateEvent(adminToken: string, event: BoraEvent): Promise<BoraEvent> {
  if (adminToken !== event.adminToken) throw new Error('Link de administrador inválido');
  if (supabase) {
    const { error } = await supabase.from('events').update(toDbEvent(event)).eq('id', event.id).eq('admin_token', adminToken);
    if (error) throw error;
  } else {
    const items = readLocal();
    const index = items.findIndex((item) => item.event.id === event.id && item.event.adminToken === adminToken);
    if (index === -1) throw new Error('Evento não encontrado');
    items[index].event = event;
    writeLocal(items);
  }
  return event;
}
