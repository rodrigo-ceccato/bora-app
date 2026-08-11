import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './db.mjs';
import { pushEnabled, sendPush, validSubscription, vapidPublicKey } from './push.mjs';

const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.CORS_ORIGIN || '';
const maxBodyBytes = 256 * 1024;
const modes = new Set(['agora', 'mais-tarde', 'marcar']);
const responses = new Set(['accept', 'decline', 'maybe']);
const pushPreferences = new Set(['votes', 'changes', 'confirmed', 'threshold', 'upcoming', 'messages']);
const defaultVotePageSize = 200;
const maxVotePageSize = 500;
const reminderBatchSize = 100;
const trustedProxyHops = Math.max(0, Math.min(10, Number.parseInt(process.env.BORA_TRUST_PROXY_HOPS || '0', 10) || 0));
const rateLimitScale = Math.max(1, Math.min(100, Number(process.env.BORA_RATE_LIMIT_SCALE) || 1));
let metricsCache = null;
let lastPresenceCleanup = 0;
let reminderScanRunning = false;

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function participantHash(participantId) { return createHash('sha256').update(`presence:${participantId}`).digest('hex'); }

function tokenMatches(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const received = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function uid(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

export function slugify(title) {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'bora';
  // The slug is the public invitation capability. Keep enough random material
  // that enumeration is impractical even when event titles are predictable.
  return `${base}-${randomBytes(16).toString('hex')}`;
}

export async function withUniqueSlug(title, insert, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await insert(slugify(title));
    } catch (error) {
      const slugCollision = error?.code === '23505' && error?.constraint === 'events_slug_key';
      if (!slugCollision || attempt === attempts - 1) throw error;
    }
  }
  throw new Error('Unable to allocate an event slug.');
}

function text(value, maxLength, required = false) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw httpError(400, 'Preencha todos os campos obrigatórios.');
  if (normalized.length > maxLength) throw httpError(400, `Use no máximo ${maxLength} caracteres.`);
  return normalized;
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2 || number > 999) {
    throw httpError(400, 'O mínimo de confirmações deve ser um inteiro entre 2 e 999.');
  }
  return number;
}

function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validClockTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validIsoDate(value, required = false) {
  if (!value && !required) return null;
  if (typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    throw httpError(400, 'Data ou horário deve incluir o fuso horário.');
  }
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    || !validCalendarDate(value.slice(0, 10))
    || Number.isNaN(Date.parse(value))) {
    throw httpError(400, 'Data ou horário inválido.');
  }
  return new Date(value).toISOString();
}

function validateDays(value) {
  if (!Array.isArray(value)) throw httpError(400, 'Dias e horários inválidos.');
  if (value.length === 0) throw httpError(400, 'Adicione pelo menos um dia com horários.');
  if (value.length > 14) throw httpError(400, 'Use no máximo 14 dias.');
  const ids = new Set();
  const dates = new Set();
  return value.map((day) => {
    if (!day || typeof day !== 'object' || Array.isArray(day)) throw httpError(400, 'Dia inválido.');
    const id = text(day.id, 100, true);
    const date = text(day.date, 10, true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw httpError(400, 'Identificador de dia inválido.');
    if (!validCalendarDate(date)) throw httpError(400, 'Data de dia inválida.');
    if (ids.has(id)) throw httpError(400, 'Não repita o identificador de um dia.');
    if (dates.has(date)) throw httpError(400, 'Não repita a mesma data.');
    ids.add(id);
    dates.add(date);
    if (!Array.isArray(day.slots) || day.slots.length === 0) {
      throw httpError(400, 'Cada dia precisa ter pelo menos um horário.');
    }
    if (day.slots.length > 48) throw httpError(400, 'Use no máximo 48 horários por dia.');
    const slots = day.slots.map((slot) => {
      if (!validClockTime(slot)) throw httpError(400, 'Horário inválido.');
      return slot;
    });
    if (new Set(slots).size !== slots.length) throw httpError(400, 'Não repita horários no mesmo dia.');
    return {
      id,
      label: text(day.label, 80, true),
      date,
      slots
    };
  });
}

function validateTimeZone(value, allowMissing = false) {
  const candidate = text(value, 100);
  if (!candidate) {
    if (allowMissing) return null;
    throw httpError(400, 'Informe o fuso horário do evento.');
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    throw httpError(400, 'Fuso horário inválido.');
  }
}

function validateAlternatives(value, startsAt, allowedLegacyAlternatives = []) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw httpError(400, 'Horários alternativos inválidos.');
  if (value.length > 12) throw httpError(400, 'Use no máximo 12 horários alternativos.');
  const legacy = new Set(allowedLegacyAlternatives);
  const alternatives = value.map((item) => {
    if (legacy.has(item)) return item;
    return validIsoDate(item, true);
  });
  if (new Set(alternatives).size !== alternatives.length) throw httpError(400, 'Não repita horários alternativos.');
  if (alternatives.includes(startsAt)) throw httpError(400, 'O horário principal não pode ser repetido como alternativa.');
  return alternatives;
}

export function validateEvent(input, { allowedLegacyAlternatives = [], allowMissingTimeZone = false } = {}) {
  const mode = modes.has(input?.mode) ? input.mode : null;
  if (!mode) throw httpError(400, 'Tipo de Bora inválido.');
  const startsAt = mode === 'marcar' ? null : validIsoDate(input.startsAt, true);
  const event = {
    mode,
    title: text(input.title, 120, true),
    place: text(input.place, 240, true),
    description: text(input.description, 1000),
    threshold: positiveInteger(input.threshold),
    startsAt,
    alternatives: mode === 'mais-tarde'
      ? validateAlternatives(input.alternatives, startsAt, allowedLegacyAlternatives)
      : [],
    days: mode === 'marcar' ? validateDays(input.days) : [],
    timeZone: mode === 'marcar' ? validateTimeZone(input.timeZone, allowMissingTimeZone) : 'UTC',
    createdByName: text(input.createdByName, 80, true),
    notifyCreatorOnVote: input.notifyCreatorOnVote !== false,
    votingClosed: Boolean(input.votingClosed)
  };
  let decidedOption = text(input.decidedOption, 200);
  if (mode === 'mais-tarde' && decidedOption && !decidedOption.startsWith('legacy:')) {
    decidedOption = validIsoDate(decidedOption, true);
  }
  if (decidedOption && !eventOptionIds(event).has(decidedOption)) {
    throw httpError(400, 'O horário escolhido não pertence a este Bora.');
  }
  return { ...event, decidedOption: decidedOption || null };
}

export function eventOptionIds(event) {
  if (event.mode === 'mais-tarde') {
    return new Set([event.startsAt, ...(event.alternatives || [])].filter(Boolean).map((value) => (
      !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : `legacy:${value}`
    )));
  }
  if (event.mode === 'marcar') {
    return new Set((event.days || []).flatMap((day) => day.slots.map((slot) => `${day.id}:${slot}`)));
  }
  return new Set();
}

export function creatorVoteSchedule(event) {
  return {
    preferredOptions: event.mode === 'mais-tarde' ? [...eventOptionIds(event)] : [],
    availability: event.mode === 'marcar'
      ? Object.fromEntries(event.days.map((day) => [day.id, [...day.slots]]))
      : {}
  };
}

export function retainedGuestSchedule(current, updated) {
  const currentOptions = eventOptionIds(current);
  const updatedOptions = eventOptionIds(updated);
  const preferredOptions = current.mode === 'mais-tarde'
    ? [...currentOptions].filter((option) => updatedOptions.has(option))
    : [];
  const currentDays = new Map((current.days || []).map((day) => [day.id, day]));
  const availability = updated.mode === 'marcar'
    ? Object.fromEntries((updated.days || []).flatMap((day) => {
      const previous = currentDays.get(day.id);
      return previous?.date === day.date ? [[day.id, [...day.slots]]] : [];
    }))
    : {};
  return { preferredOptions, availability };
}

export function validatePreferredOptions(input, event, required = false) {
  const raw = Array.isArray(input?.preferredOptions)
    ? input.preferredOptions
    : input?.preferredOption ? [input.preferredOption] : [];
  const allowed = eventOptionIds(event);
  const preferredOptions = Array.from(new Set(raw
    .filter((value) => typeof value === 'string')
    .map((value) => {
      const option = text(value, 200);
      if (!option) return '';
      if (allowed.has(option) || option.startsWith('legacy:')) return option;
      const instant = new Date(option);
      return Number.isNaN(instant.getTime()) ? option : instant.toISOString();
    })
    .filter((value) => allowed.has(value))));
  if (required && preferredOptions.length === 0) {
    throw httpError(400, 'Marque pelo menos um horário ou selecione “Não posso”.');
  }
  return preferredOptions;
}

export function validateVote(input, event) {
  const response = responses.has(input?.response) ? input.response : null;
  if (!response) throw httpError(400, 'Resposta inválida.');
  const participantId = text(input.participantId, 100, true);
  const rawAvailability = input.availability && typeof input.availability === 'object' && !Array.isArray(input.availability)
    ? input.availability
    : {};
  // Iterate the event contract, not attacker-controlled object keys. This
  // bounds persisted JSON to at most 14 known days and drops empty/unknown keys.
  const cleanedAvailability = Object.fromEntries((event.days || []).flatMap((day) => {
    const selected = rawAvailability[day.id];
    if (!Array.isArray(selected)) return [];
    const allowed = new Set(day.slots);
    const slots = Array.from(new Set(selected.filter((slot) => typeof slot === 'string' && allowed.has(slot))));
    return slots.length ? [[day.id, slots]] : [];
  }));
  const selectedSlots = Object.values(cleanedAvailability).flat();
  if (event.mode === 'marcar' && response !== 'decline' && selectedSlots.length === 0) {
    throw httpError(400, 'Marque pelo menos um horário ou selecione “Não posso”.');
  }
  return {
    participantId,
    voterName: text(input.voterName, 80, true),
    response,
    preferredOptions: event.mode === 'mais-tarde' && response !== 'decline'
      ? validatePreferredOptions(input, event, true)
      : [],
    availability: event.mode === 'marcar' && response !== 'decline' ? cleanedAvailability : {}
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    slug: row.slug,
    mode: row.mode,
    title: row.title,
    place: row.place,
    description: row.description,
    threshold: row.threshold,
    startsAt: row.starts_at?.toISOString?.() || row.starts_at || undefined,
    alternatives: row.alternatives || [],
    days: row.days || [],
    timeZone: row.event_timezone || undefined,
    createdByName: row.current_creator_name || row.created_by_name,
    notifyCreatorOnVote: row.notify_creator_on_vote !== false,
    votingClosed: row.voting_closed,
    revision: Number(row.revision) || 0,
    decidedOption: row.decided_option || undefined,
    decidedAt: row.decided_at?.toISOString?.() || row.decided_at || undefined,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function messagesClosed(row) {
  if (row.starts_at && new Date(row.starts_at).getTime() <= Date.now()) return true;
  if (row.mode === 'marcar' && Array.isArray(row.days) && row.days.length) {
    const latestDay = row.days.map((day) => day?.date).filter(Boolean).sort().at(-1);
    return Boolean(latestDay && latestDay < new Date().toISOString().slice(0, 10));
  }
  return false;
}

function mapEventSummary(row) {
  const participantResponse = responses.has(row.participant_response) ? row.participant_response : undefined;
  return {
    ...mapEvent(row),
    confirmedCount: Number(row.confirmed_count) || 0,
    ...(participantResponse ? { participantResponse } : {})
  };
}

function mapVote(row, viewerParticipantId = '') {
  return {
    id: row.id,
    eventId: row.event_id,
    isOwn: Boolean(viewerParticipantId && row.participant_id === viewerParticipantId),
    voterName: row.current_voter_name || row.voter_name,
    response: row.response,
    preferredOptions: row.preferred_options || (row.preferred_option ? [`legacy:${row.preferred_option}`] : []),
    availability: row.availability || {},
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function mapMessage(row, viewerParticipantId = '') {
  return {
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    isOwn: Boolean(viewerParticipantId && row.participant_id === viewerParticipantId)
  };
}

function validateMessage(input) {
  const plainText = text(input?.body, 500, true)
    .replace(/<[^>]*>/g, '')
    .split('').filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    }).join('')
    .trim();
  if (!plainText) throw httpError(400, 'Escreva um recado antes de enviar.');
  return { body: plainText, authorName: text(input?.authorName, 80, true) };
}

function parseVotePage(url) {
  const rawLimit = url.searchParams.get('votesLimit');
  const limit = rawLimit === null ? defaultVotePageSize : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxVotePageSize
    || (rawLimit !== null && String(limit) !== rawLimit)) {
    throw httpError(400, `Use entre 1 e ${maxVotePageSize} votos por página.`);
  }
  const includeSummaryValue = url.searchParams.get('includeVoteSummary');
  if (includeSummaryValue !== null && includeSummaryValue !== '0' && includeSummaryValue !== '1') {
    throw httpError(400, 'Opção de resumo de votos inválida.');
  }
  const encodedCursor = url.searchParams.get('votesCursor');
  if (!encodedCursor) return { limit, cursor: null, includeSummary: includeSummaryValue !== '0' };
  if (encodedCursor.length > 500 || !/^[A-Za-z0-9_-]+$/.test(encodedCursor)) {
    throw httpError(400, 'Cursor de votos inválido.');
  }
  try {
    const decoded = JSON.parse(Buffer.from(encodedCursor, 'base64url').toString('utf8'));
    // PostgreSQL timestamps retain microseconds while JS Dates retain only
    // milliseconds. Keep the database's exact sort key opaque instead of
    // round-tripping it through Date/toISOString and skipping boundary rows.
    const createdAt = decoded?.createdAt;
    if (typeof createdAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3,6}Z$/.test(createdAt)
      || !validCalendarDate(createdAt.slice(0, 10))
      || Number.isNaN(Date.parse(createdAt))) throw new Error('invalid cursor timestamp');
    const id = text(decoded?.id, 100, true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('invalid vote id');
    return { limit, cursor: { createdAt, id }, includeSummary: includeSummaryValue !== '0' };
  } catch {
    throw httpError(400, 'Cursor de votos inválido.');
  }
}

function encodeVoteCursor(row) {
  const date = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  const fallback = Number.isNaN(date.getTime()) ? null : `${date.toISOString().slice(0, -1)}000Z`;
  return Buffer.from(JSON.stringify({
    createdAt: row.cursor_created_at || fallback,
    id: row.id
  })).toString('base64url');
}

export function votePageQuery(eventId, { limit = defaultVotePageSize, cursor = null } = {}) {
  if (cursor) {
    return {
      text: `select votes.*, profile.display_name as current_voter_name, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at from votes
       left join participant_profiles profile on profile.participant_id = votes.participant_id
       where event_id = $1 and (created_at, id) < ($2::timestamptz, $3::text)
       order by created_at desc, id desc limit $4`,
      values: [eventId, cursor.createdAt, cursor.id, limit + 1]
    };
  }
  return {
    text: `select votes.*, profile.display_name as current_voter_name, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at from votes
     left join participant_profiles profile on profile.participant_id = votes.participant_id where event_id = $1
     order by created_at desc, id desc limit $2`,
    values: [eventId, limit + 1]
  };
}

function mapVoteSummary(row = {}) {
  return {
    total: Number(row.total) || 0,
    responses: {
      accept: Number(row.accept_count) || 0,
      maybe: Number(row.maybe_count) || 0,
      decline: Number(row.decline_count) || 0
    },
    optionCounts: row.option_counts && typeof row.option_counts === 'object' ? row.option_counts : {}
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function assertPatchMode(current, input) {
  if (!modes.has(input?.mode)) throw httpError(400, 'Tipo de Bora inválido.');
  if (current.mode !== input.mode) throw httpError(409, 'Não é possível alterar o tipo deste Bora.');
}

export function assertEventRevision(current, input) {
  if (!Number.isInteger(input?.revision) || input.revision < 0 || input.revision !== current.revision) {
    throw httpError(409, 'Este Bora foi alterado em outro lugar. Atualize a página e tente novamente.');
  }
}

function bearerToken(request) {
  const authorization = request.headers.authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function normalizedIp(value) {
  let candidate = String(value || '').trim();
  if (candidate.startsWith('[')) candidate = candidate.match(/^\[([^\]]+)](?::\d+)?$/)?.[1] || '';
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) candidate = candidate.slice(0, candidate.lastIndexOf(':'));
  if (candidate.toLowerCase().startsWith('::ffff:') && isIP(candidate.slice(7)) === 4) candidate = candidate.slice(7);
  return isIP(candidate) ? candidate.toLowerCase() : '';
}

export function resolveClientAddress(request, proxyHops = trustedProxyHops) {
  const socketAddress = normalizedIp(request.socket?.remoteAddress) || 'unknown';
  const hops = Number.isInteger(proxyHops) ? Math.max(0, Math.min(10, proxyHops)) : 0;
  if (hops === 0) return socketAddress;
  const forwarded = String(request.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map(normalizedIp);
  // The socket peer is the first trusted hop and is not present in XFF. Each
  // additional trusted proxy is consumed from the right side of the chain.
  const candidate = forwarded[forwarded.length - hops];
  return candidate || socketAddress;
}

export function createRateLimiter({
  maxBuckets = 10_000,
  now = () => Date.now(),
  proxyHops = trustedProxyHops,
  scale = rateLimitScale
} = {}) {
  const buckets = new Map();
  const bucketLimit = Math.max(1, maxBuckets);
  const limitScale = Math.max(1, Math.min(100, Number(scale) || 1));

  function prune(timestamp) {
    for (const [key, value] of buckets) {
      if (value.resetAt <= timestamp) buckets.delete(key);
    }
  }

  function enforce(request, response) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method || '')) return;
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    const address = resolveClientAddress(request, proxyHops);
    const isCreation = request.method === 'POST' && pathname === '/api/events';
    const limit = Math.floor((isCreation ? 12 : 90) * limitScale);
    const windowMs = isCreation ? 15 * 60_000 : 60_000;
    const category = isCreation ? 'create' : 'mutation';
    let key = `${category}:${address}`;
    const timestamp = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      if (!bucket && buckets.size >= bucketLimit) {
        prune(timestamp);
        if (buckets.size >= bucketLimit) {
          key = `${category}:overflow`;
          bucket = buckets.get(key);
          if (!bucket) {
            buckets.delete(buckets.keys().next().value);
          }
        }
      }
      if (!bucket || bucket.resetAt <= timestamp) {
        bucket = { count: 0, resetAt: timestamp + windowMs };
      }
    }
    bucket.count += 1;
    // Refresh insertion order so the hard-cap eviction removes the least
    // recently seen live bucket rather than an actively rate-limited client.
    buckets.delete(key);
    buckets.set(key, bucket);
    if (bucket.count > limit) {
      response.setHeader('retry-after', String(Math.ceil((bucket.resetAt - timestamp) / 1000)));
      throw httpError(429, 'Muitas tentativas. Aguarde um pouco e tente novamente.');
    }
  }

  enforce.bucketCount = () => buckets.size;
  return enforce;
}

const enforceRateLimit = createRateLimiter();

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw httpError(413, 'Requisição muito grande.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw httpError(400, 'JSON inválido.');
  }
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

export function zonedDateTimeToDate(dateKey, clockTime, timeZone = 'UTC') {
  if (!validCalendarDate(dateKey) || !validClockTime(clockTime)) return null;
  let zone;
  try {
    zone = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = clockTime.split(':').map(Number);
  const targetWallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = targetWallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(instant), zone);
    const renderedWallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const difference = targetWallClock - renderedWallClock;
    instant += difference;
    if (difference === 0) break;
  }
  const result = new Date(instant);
  const rendered = zonedParts(result, zone);
  if (rendered.year !== year || rendered.month !== month || rendered.day !== day
    || rendered.hour !== hour || rendered.minute !== minute) return null;
  return result;
}

export function scheduleEntryKeys(event) {
  if (event.mode === 'agora') {
    return event.startsAt ? new Set([`agora:${event.startsAt}`]) : new Set();
  }
  if (event.mode === 'mais-tarde') {
    return new Set([event.startsAt, ...(event.alternatives || [])].filter(Boolean).map((option) => `mais-tarde:${option}`));
  }
  const timeZone = event.event_timezone || event.timeZone || 'floating';
  return new Set((event.days || []).flatMap((day) => day.slots.map((slot) => (
    `marcar:${timeZone}:${day.id}:${day.date}:${slot}`
  ))));
}

export function validateFutureSchedule(event, { now = Date.now(), allowedPastKeys = new Set() } = {}) {
  const allowed = allowedPastKeys instanceof Set ? allowedPastKeys : new Set(allowedPastKeys);
  const entries = [];
  if (event.mode === 'agora') {
    entries.push({ key: `agora:${event.startsAt}`, instant: new Date(event.startsAt) });
  } else if (event.mode === 'mais-tarde') {
    for (const option of [event.startsAt, ...(event.alternatives || [])]) {
      entries.push({ key: `mais-tarde:${option}`, instant: new Date(option) });
    }
  } else {
    const timeZone = event.event_timezone || event.timeZone;
    for (const day of event.days || []) {
      for (const slot of day.slots) {
        entries.push({
          key: `marcar:${timeZone || 'floating'}:${day.id}:${day.date}:${slot}`,
          instant: timeZone ? zonedDateTimeToDate(day.date, slot, timeZone) : null
        });
      }
    }
  }
  for (const entry of entries) {
    if (allowed.has(entry.key)) continue;
    if (!entry.instant || Number.isNaN(entry.instant.getTime())) {
      if (event.mode === 'marcar' && !(event.event_timezone || event.timeZone)) {
        throw httpError(400, 'Defina o fuso horário antes de alterar dias ou horários antigos.');
      }
      throw httpError(400, 'Um horário não existe no fuso horário escolhido.');
    }
    if (entry.instant.getTime() <= now) {
      throw httpError(400, 'Escolha apenas datas e horários futuros.');
    }
  }
}

export function eventStartAt(event) {
  if (event.mode === 'mais-tarde') {
    const decided = event.decided_option || event.decidedOption;
    if (decided) {
      const selected = new Date(decided);
      if (!Number.isNaN(selected.getTime())) return selected;
    }
    return event.starts_at ? new Date(event.starts_at) : event.startsAt ? new Date(event.startsAt) : null;
  }
  if (event.mode !== 'marcar') return event.starts_at ? new Date(event.starts_at) : event.startsAt ? new Date(event.startsAt) : null;
  const decided = event.decided_option || event.decidedOption;
  if (!decided) return null;
  const dayId = decided.slice(0, -6);
  const time = decided.slice(-5);
  const day = (event.days || []).find((item) => item.id === dayId);
  if (!day || !validClockTime(time)) return null;
  const timeZone = event.event_timezone || event.timeZone;
  return timeZone ? zonedDateTimeToDate(day.date, time, timeZone) : null;
}

export function reminderStartAt(event) {
  if (event.mode === 'agora') return eventStartAt(event);
  if (!(event.decided_option || event.decidedOption)) return null;
  return eventStartAt(event);
}

export function dueReminderQuery({ now = Date.now(), cursor = null, limit = reminderBatchSize } = {}) {
  const timestamp = Number(now);
  const lower = new Date(timestamp).toISOString();
  const upper24h = new Date(timestamp + 24 * 3_600_000).toISOString();
  return {
    text: `select * from events
     where reminder_starts_at is not null
       and reminder_starts_at > $1::timestamptz
       and reminder_starts_at <= $2::timestamptz
       and ($3::timestamptz is null or (reminder_starts_at, id) > ($3::timestamptz, $4::text))
     order by reminder_starts_at asc, id asc
     limit $5`,
    values: [lower, upper24h, cursor?.startsAt || null, cursor?.id || null,
      Math.max(1, Math.min(500, Math.floor(limit) || reminderBatchSize))]
  };
}

export function reminderNotificationKind(windowName, event) {
  const startsAt = new Date(event.reminder_starts_at || event.reminderStartsAt);
  if (Number.isNaN(startsAt.getTime()) || !['24h', '2h'].includes(windowName)) {
    throw new Error('Invalid reminder notification identity.');
  }
  return `reminder-${windowName}:${startsAt.toISOString()}`;
}

export function voteNotificationPlan(event, vote, acceptedCount, nonce = '', previousAcceptedCount = acceptedCount - 1) {
  const notifications = [];
  if (event.notify_creator_on_vote !== false && vote.participantId !== event.created_by_participant_id) {
    notifications.push({ audience: 'creator', preference: 'votes', kind: `vote-${nonce || vote.id}`, title: `Novo voto: ${event.title}`, body: `${vote.voterName} respondeu ao seu Bora.` });
  }
  if (previousAcceptedCount < event.threshold && acceptedCount >= event.threshold) {
    // A crossing gets a distinct idempotency key. This permits a new alert if
    // confirmations later fall below the threshold and cross it again, while
    // still making retries of this particular vote safe.
    notifications.push({ audience: 'participants', preference: 'threshold', kind: `threshold-reached-${nonce || vote.id}`, title: `Meta atingida: ${event.title}`, body: 'O mínimo de confirmações foi alcançado.' });
  }
  return notifications;
}

export function eventUpdateNotificationPlan(current, updated) {
  if (!current.decided_option && updated.decided_option) {
    return [{ audience: 'participants', preference: 'confirmed', kind: 'confirmed', title: `Bora confirmado: ${updated.title}`, body: `O encontro foi definido em ${updated.place}.` }];
  }
  const changed = current.starts_at?.getTime?.() !== updated.starts_at?.getTime?.()
    || current.decided_option !== updated.decided_option
    || JSON.stringify(current.alternatives) !== JSON.stringify(updated.alternatives)
    || JSON.stringify(current.days) !== JSON.stringify(updated.days)
    || (current.event_timezone || '') !== (updated.event_timezone || '')
    || current.place !== updated.place;
  return changed ? [{ audience: 'participants', preference: 'changes', kind: `changed-${randomBytes(8).toString('hex')}`, title: `Bora alterado: ${updated.title}`, body: `Confira a nova data, horário ou local em ${updated.place}.` }] : [];
}

export function deletionNotificationPlan(event, now = Date.now()) {
  const startsAt = eventStartAt(event)?.getTime();
  return startsAt && startsAt > now
    ? [{ audience: 'participants', preference: 'changes', kind: 'cancelled', title: `Bora cancelado: ${event.title}`, body: 'Este Bora foi cancelado pelo organizador.' }]
    : [];
}

export function pushSubscriptionQuery(event, audience, preference) {
  if (!pushPreferences.has(preference)) throw new Error('Unknown push preference.');
  const participantClause = audience === 'creator'
    ? 'participant_id = $1'
    : `participant_id = $1 or participant_id in (select participant_id from votes where event_id = $2)`;
  return {
    text: `select distinct push_subscriptions.* from push_subscriptions
     where (${participantClause}) and notify_${preference} = true
     limit 2000`,
    values: audience === 'creator' ? [event.created_by_participant_id] : [event.created_by_participant_id, event.id]
  };
}

export function pushPreferencesResponse(row) {
  return {
    subscribed: Boolean(row),
    preferences: row ? {
      votes: row.notify_votes,
      changes: row.notify_changes,
      confirmed: row.notify_confirmed,
      threshold: row.notify_threshold,
      upcoming: row.notify_upcoming,
      messages: row.notify_messages
    } : {}
  };
}

export function coarsenPresenceCount(value) {
  const count = Math.max(0, Number(value) || 0);
  return count > 0 && count < 5 ? 4 : count;
}

async function deliverEventPush(subscription, event, kind, title, body) {
  let claimed = false;
  try {
    const claim = await pool.query(
      `insert into push_notifications (subscription_id, event_id, kind) values ($1,$2,$3)
       on conflict (subscription_id, event_id, kind) do nothing returning id`,
      [subscription.id, event.id, kind]
    );
    if (!claim.rowCount) return;
    claimed = true;
    await sendPush(subscription, { title, body, url: `/e/${event.slug}` });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await pool.query('delete from push_subscriptions where id = $1', [subscription.id]);
    } else {
      if (claimed) {
        await pool.query(
          'delete from push_notifications where subscription_id = $1 and event_id = $2 and kind = $3',
          [subscription.id, event.id, kind]
        ).catch((cleanupError) => console.error('Unable to release failed web push claim', cleanupError));
      }
      console.error('Unable to send web push notification', error);
    }
  }
}

async function deliverUntrackedPush(subscription, event, title, body) {
  try {
    await sendPush(subscription, { title, body, url: `/e/${event.slug}` });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await pool.query('delete from push_subscriptions where id = $1', [subscription.id])
        .catch((cleanupError) => console.error('Unable to remove stale web push subscription', cleanupError));
    } else {
      console.error('Unable to send web push notification', error);
    }
  }
}

export async function runBoundedWork(items, worker, {
  concurrency = 20,
  deadlineAt = Number.POSITIVE_INFINITY,
  now = () => Date.now()
} = {}) {
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length && now() < deadlineAt) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

async function sendCancellationPush(subscriptions, event, notification) {
  await runBoundedWork(subscriptions, (subscription) => (
    deliverUntrackedPush(subscription, event, notification.title, notification.body)
  ), { concurrency: 20, deadlineAt: Date.now() + 30_000 });
}

async function sendEventPush(event, kind, title, body, audience = 'participants', preference = 'upcoming') {
  if (!pushEnabled) return;
  const subscriptions = await pool.query(pushSubscriptionQuery(event, audience, preference));
  await runBoundedWork(subscriptions.rows, (subscription) => (
    deliverEventPush(subscription, event, kind, title, body)
  ), { concurrency: 20, deadlineAt: Date.now() + 30_000 });
}

async function sendMessagePush(event, message) {
  if (!pushEnabled) return;
  const query = pushSubscriptionQuery(event, 'participants', 'messages');
  const subscriptions = await pool.query(
    query.text.replace('limit 2000', `and participant_id <> $${query.values.length + 1} limit 2000`),
    [...query.values, message.participant_id]
  );
  await runBoundedWork(subscriptions.rows, (subscription) => (
    deliverEventPush(subscription, event, `message-${message.id}`, `Novo recado: ${event.title}`, `${message.author_name} deixou um recado.`)
  ), { concurrency: 20, deadlineAt: Date.now() + 30_000 });
}

async function sendDueReminders() {
  if (!pushEnabled) return;
  const scanStartedAt = Date.now();
  let cursor = null;
  while (true) {
    const result = await pool.query(dueReminderQuery({ now: scanStartedAt, cursor }));
    if (!result.rows.length) break;
    await runBoundedWork(result.rows, async (event) => {
      const hours = (new Date(event.reminder_starts_at).getTime() - scanStartedAt) / 3_600_000;
      if (hours <= 2) {
        await sendEventPush(event, reminderNotificationKind('2h', event), `Em breve: ${event.title}`, `Seu Bora começa em até 2 horas, em ${event.place}.`, 'participants', 'upcoming');
      } else if (hours <= 24) {
        const late = hours < 18;
        await sendEventPush(
          event,
          reminderNotificationKind('24h', event),
          `${late ? 'Próximo Bora' : 'Amanhã'}: ${event.title}`,
          late ? `Seu Bora começa nas próximas ${Math.ceil(hours)} horas, em ${event.place}.` : `Seu Bora começa amanhã em ${event.place}.`,
          'participants',
          'upcoming'
        );
      }
    }, { concurrency: 4 });
    const last = result.rows.at(-1);
    cursor = {
      startsAt: last.reminder_starts_at?.toISOString?.() || last.reminder_starts_at,
      id: last.id
    };
    if (result.rows.length < reminderBatchSize) break;
  }
}

function runInBackground(task, label) {
  Promise.resolve(task).catch((error) => console.error(`${label} failed`, error));
}

async function runReminderScan() {
  if (reminderScanRunning) return;
  reminderScanRunning = true;
  try {
    await sendDueReminders();
  } finally {
    reminderScanRunning = false;
  }
}

async function findEvent(slug) {
  const result = await pool.query(`select events.*, profile.display_name as current_creator_name
    from events left join participant_profiles profile on profile.participant_id = events.created_by_participant_id
    where events.slug = $1`, [slug]);
  if (!result.rows[0]) throw httpError(404, 'Evento não encontrado.');
  return result.rows[0];
}

export async function route(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    await pool.query('select 1');
    return send(response, 200, { status: 'ok' });
  }

  if (request.method === 'POST' && url.pathname === '/api/presence') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    await pool.query(
      `insert into participant_presence (participant_hash, last_seen_at) values ($1, now())
       on conflict (participant_hash) do update set last_seen_at = excluded.last_seen_at
       where participant_presence.last_seen_at < now() - interval '45 seconds'`,
      [participantHash(participantId)]
    );
    if (Date.now() - lastPresenceCleanup > 60 * 60_000) {
      lastPresenceCleanup = Date.now();
      runInBackground(pool.query(`delete from participant_presence where last_seen_at < now() - interval '24 hours'`), 'Presence cleanup');
    }
    return send(response, 204);
  }

  if (request.method === 'GET' && url.pathname === '/api/metrics') {
    if (metricsCache && Date.now() - metricsCache.at < 20_000) return send(response, 200, metricsCache.value);
    const result = await pool.query(`
      select
        (select count(*)::int from participant_presence where last_seen_at >= now() - interval '5 minutes') as "onlineNow",
        (select count(*)::int from events) as "totalEvents",
        (select count(*)::int from events where voting_closed = false) as "openEvents",
        (select count(distinct participant_id)::int from (
          select created_by_participant_id as participant_id from events
          union
          select participant_id from votes
        ) identities where participant_id is not null) as "uniqueParticipants"
    `);
    const value = {
      ...result.rows[0],
      onlineNow: coarsenPresenceCount(result.rows[0].onlineNow),
      onlineWindowMinutes: 5,
      generatedAt: new Date().toISOString()
    };
    metricsCache = { at: Date.now(), value };
    return send(response, 200, value);
  }

  if (request.method === 'GET' && url.pathname === '/api/push/public-key') {
    if (!pushEnabled) throw httpError(503, 'Os lembretes ainda não foram configurados.');
    return send(response, 200, { publicKey: vapidPublicKey() });
  }

  if (request.method === 'POST' && url.pathname === '/api/push/subscriptions') {
    if (!pushEnabled) throw httpError(503, 'Os lembretes ainda não foram configurados.');
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const subscription = await readJson(request);
    if (!validSubscription(subscription)) throw httpError(400, 'Assinatura de lembrete inválida.');
    await pool.query(
      `insert into push_subscriptions (id, participant_id, endpoint, p256dh, auth, updated_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (endpoint) do update set participant_id=excluded.participant_id, p256dh=excluded.p256dh, auth=excluded.auth, updated_at=now()`,
      [uid('push'), participantId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    return send(response, 201, { status: 'subscribed' });
  }

  if (request.method === 'GET' && url.pathname === '/api/push/subscriptions/preferences') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const endpoint = text(url.searchParams.get('endpoint'), 2000, true);
    const result = await pool.query('select notify_votes, notify_changes, notify_confirmed, notify_threshold, notify_upcoming, notify_messages from push_subscriptions where participant_id = $1 and endpoint = $2', [participantId, endpoint]);
    return send(response, 200, pushPreferencesResponse(result.rows[0]));
  }

  if (request.method === 'PUT' && url.pathname === '/api/push/subscriptions/preferences') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const input = await readJson(request);
    const endpoint = text(input.endpoint, 2000, true);
    const preferences = input.preferences || {};
    await pool.query(`update push_subscriptions set notify_votes=$1, notify_changes=$2, notify_confirmed=$3, notify_threshold=$4, notify_upcoming=$5, notify_messages=$6, updated_at=now() where participant_id=$7 and endpoint=$8`, [preferences.votes !== false, preferences.changes !== false, preferences.confirmed !== false, preferences.threshold !== false, preferences.upcoming !== false, preferences.messages === true, participantId, endpoint]);
    return send(response, 200, { status: 'updated' });
  }

  if (request.method === 'DELETE' && url.pathname === '/api/push/subscriptions') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const endpoint = text((await readJson(request)).endpoint, 2000, true);
    await pool.query('delete from push_subscriptions where participant_id = $1 and endpoint = $2', [participantId, endpoint]);
    return send(response, 204);
  }

  if (request.method === 'GET' && url.pathname === '/api/me/events') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const [created, joined] = await Promise.all([
      pool.query(
        `select events.*, profile.display_name as current_creator_name, coalesce(vote_summary.confirmed_count, 0)::int as confirmed_count,
                participant_vote.response as participant_response
         from events
         left join participant_profiles profile on profile.participant_id = events.created_by_participant_id
         left join lateral (
           select count(*) filter (where response = 'accept')::int as confirmed_count
           from votes where votes.event_id = events.id
         ) vote_summary on true
         left join votes participant_vote
           on participant_vote.event_id = events.id and participant_vote.participant_id = $1
         where events.created_by_participant_id = $1
         order by coalesce(events.starts_at, events.created_at) desc
         limit 100`,
        [participantId]
      ),
      pool.query(
        `select events.*, profile.display_name as current_creator_name, coalesce(vote_summary.confirmed_count, 0)::int as confirmed_count,
                participant_vote.response as participant_response
         from events
         left join participant_profiles profile on profile.participant_id = events.created_by_participant_id
         join votes participant_vote
           on participant_vote.event_id = events.id and participant_vote.participant_id = $1
         left join lateral (
           select count(*) filter (where response = 'accept')::int as confirmed_count
           from votes where votes.event_id = events.id
         ) vote_summary on true
         where participant_vote.participant_id = $1
           and events.created_by_participant_id is distinct from $1
         order by coalesce(events.starts_at, events.created_at) desc
         limit 100`,
        [participantId]
      )
    ]);
    return send(response, 200, {
      created: created.rows.map(mapEventSummary),
      joined: joined.rows.map(mapEventSummary)
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/me/profile') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const result = await pool.query('select display_name, updated_at from participant_profiles where participant_id = $1', [participantId]);
    const profile = result.rows[0];
    return send(response, 200, {
      name: profile?.display_name || '',
      updatedAt: profile?.updated_at?.toISOString?.() || profile?.updated_at || null
    });
  }

  if (request.method === 'PUT' && url.pathname === '/api/me/profile') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const name = text((await readJson(request)).name, 80, true);
    const result = await pool.query(
      `insert into participant_profiles (participant_id, display_name, updated_at) values ($1, $2, now())
       on conflict (participant_id) do update set display_name = excluded.display_name, updated_at = now()
       returning display_name, updated_at`,
      [participantId, name]
    );
    const profile = result.rows[0];
    return send(response, 200, { name: profile.display_name, updatedAt: profile.updated_at?.toISOString?.() || profile.updated_at });
  }

  if (request.method === 'POST' && url.pathname === '/api/me/recovery-link') {
    const participantId = text(request.headers['x-participant-id'], 100, true);
    const recoveryToken = `rec_${randomBytes(32).toString('base64url')}`;
    await pool.query(
      `insert into participant_recovery_tokens (participant_id, token_hash, updated_at)
       values ($1, $2, now())
       on conflict (participant_id) do update set token_hash = excluded.token_hash, updated_at = now()`,
      [participantId, tokenHash(recoveryToken)]
    );
    return send(response, 201, { recoveryToken });
  }

  if (request.method === 'POST' && url.pathname === '/api/recover') {
    const recoveryToken = text((await readJson(request)).recoveryToken, 200, true);
    const result = await pool.query('select participant_id from participant_recovery_tokens where token_hash = $1', [tokenHash(recoveryToken)]);
    if (!result.rows[0]) throw httpError(404, 'Link de recuperação inválido ou revogado.');
    return send(response, 200, { participantId: result.rows[0].participant_id });
  }

  if (request.method === 'POST' && url.pathname === '/api/events') {
    const body = await readJson(request);
    const eventInput = validateEvent(body.event || body);
    validateFutureSchedule(eventInput);
    const participantId = text(body.participantId, 100, true);
    const eventId = uid('evt');
    const voteId = uid('vote');
    const adminToken = `adm_${randomBytes(32).toString('base64url')}`;
    const creatorSchedule = creatorVoteSchedule(eventInput);
    const reminderStartsAt = eventInput.mode === 'agora' ? eventInput.startsAt : null;

    const result = await withUniqueSlug(eventInput.title, async (slug) => (
      withTransaction(async (client) => {
        const insertedEvent = await client.query(
          `insert into events
            (id, slug, admin_token_hash, mode, title, place, description, threshold, starts_at, alternatives, days, event_timezone, created_by_name, created_by_participant_id, notify_creator_on_vote, reminder_starts_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
          [eventId, slug, tokenHash(adminToken), eventInput.mode, eventInput.title, eventInput.place,
            eventInput.description, eventInput.threshold, eventInput.startsAt,
            JSON.stringify(eventInput.alternatives), JSON.stringify(eventInput.days), eventInput.timeZone,
            eventInput.createdByName, participantId, eventInput.notifyCreatorOnVote, reminderStartsAt]
        );
        const insertedVote = await client.query(
          `insert into votes
            (id, event_id, participant_id, voter_name, response, preferred_options, availability)
           values ($1,$2,$3,$4,'accept',$5,$6) returning *`,
          [voteId, eventId, participantId, eventInput.createdByName,
            JSON.stringify(creatorSchedule.preferredOptions), JSON.stringify(creatorSchedule.availability)]
        );
        return { event: insertedEvent.rows[0], vote: insertedVote.rows[0] };
      })
    ));
    return send(response, 201, {
      event: mapEvent(result.event),
      votes: [mapVote(result.vote, participantId)],
      adminToken,
      isAdmin: true
    });
  }

  if (parts[0] === 'api' && parts[1] === 'events' && parts[2]) {
    let slug;
    try {
      slug = decodeURIComponent(parts[2]);
    } catch {
      throw httpError(400, 'Identificador de evento inválido.');
    }

    if (request.method === 'GET' && parts.length === 3) {
      const eventRow = await findEvent(slug);
      const page = parseVotePage(url);
      const viewerParticipantId = text(request.headers['x-participant-id'], 100);
      const [votesResult, summaryResult, ownVoteResult, messagesResult] = await Promise.all([
        pool.query(votePageQuery(eventRow.id, page)),
        page.includeSummary ? pool.query(
          `with event_votes as materialized (
             select * from votes where event_id = $1
           ), response_summary as (
             select count(*)::int as total,
                    count(*) filter (where response = 'accept')::int as accept_count,
                    count(*) filter (where response = 'maybe')::int as maybe_count,
                    count(*) filter (where response = 'decline')::int as decline_count
             from event_votes
           ), option_summary as (
             select option_id, sum(option_count)::int as option_count
             from (
               select preferred.value as option_id, count(*)::int as option_count
               from event_votes
               cross join lateral jsonb_array_elements_text(
                 case when jsonb_typeof(preferred_options) = 'array' then preferred_options else '[]'::jsonb end
               ) preferred(value)
               where response <> 'decline'
               group by preferred.value
               union all
               select day.key || ':' || slot.value as option_id, count(*)::int as option_count
               from event_votes
               cross join lateral jsonb_each(
                 case when jsonb_typeof(availability) = 'object' then availability else '{}'::jsonb end
               ) day(key, value)
               cross join lateral jsonb_array_elements_text(
                 case when jsonb_typeof(day.value) = 'array' then day.value else '[]'::jsonb end
               ) slot(value)
               where response <> 'decline'
               group by day.key, slot.value
             ) raw_options
             group by option_id
           )
           select response_summary.*,
                  coalesce((select jsonb_object_agg(option_id, option_count) from option_summary), '{}'::jsonb) as option_counts
           from response_summary`,
          [eventRow.id]
        ) : Promise.resolve(null),
        viewerParticipantId
          ? pool.query(`select votes.*, profile.display_name as current_voter_name from votes
              left join participant_profiles profile on profile.participant_id = votes.participant_id
              where event_id = $1 and votes.participant_id = $2`, [eventRow.id, viewerParticipantId])
          : Promise.resolve(null),
        pool.query('select * from event_messages where event_id = $1 order by created_at asc, id asc', [eventRow.id])
      ]);
      const hasMore = votesResult.rows.length > page.limit;
      const voteRows = votesResult.rows.slice(0, page.limit);
      const nextCursor = hasMore ? encodeVoteCursor(voteRows.at(-1)) : undefined;
      return send(response, 200, {
        event: mapEvent(eventRow),
        votes: voteRows.map((vote) => mapVote(vote, viewerParticipantId)),
        ...(ownVoteResult?.rows[0] ? { ownVote: mapVote(ownVoteResult.rows[0], viewerParticipantId) } : {}),
        messages: messagesResult.rows.map((message) => mapMessage(message, viewerParticipantId)),
        messagesClosed: messagesClosed(eventRow),
        isAdmin: tokenMatches(bearerToken(request), eventRow.admin_token_hash),
        ...(summaryResult ? { voteSummary: mapVoteSummary(summaryResult.rows[0]) } : {}),
        votesTruncated: hasMore || Boolean(summaryResult && mapVoteSummary(summaryResult.rows[0]).total > voteRows.length),
        votePage: {
          limit: page.limit,
          returned: voteRows.length,
          hasMore,
          ...(nextCursor ? { nextCursor } : {})
        }
      });
    }

    if (request.method === 'POST' && parts.length === 4 && parts[3] === 'messages') {
      const participantId = text(request.headers['x-participant-id'], 100, true);
      const input = validateMessage(await readJson(request));
      const result = await withTransaction(async (client) => {
        const locked = await client.query('select * from events where slug = $1 for update', [slug]);
        const eventRow = locked.rows[0];
        if (!eventRow) throw httpError(404, 'Evento não encontrado.');
        if (messagesClosed(eventRow)) throw httpError(409, 'Este Bora já aconteceu; os recados estão encerrados.');
        const participant = await client.query('select 1 from votes where event_id = $1 and participant_id = $2', [eventRow.id, participantId]);
        if (!participant.rowCount) throw httpError(403, 'Participe deste Bora antes de deixar um recado.');
        const saved = await client.query(
          'insert into event_messages (id, event_id, participant_id, author_name, body) values ($1,$2,$3,$4,$5) returning *',
          [uid('message'), eventRow.id, participantId, input.authorName, input.body]
        );
        return { eventRow, message: saved.rows[0] };
      });
      runInBackground(sendMessagePush(result.eventRow, result.message), 'Message notification');
      return send(response, 201, { message: mapMessage(result.message, participantId) });
    }

    if (request.method === 'DELETE' && parts.length === 5 && parts[3] === 'messages') {
      const participantId = text(request.headers['x-participant-id'], 100, true);
      const messageId = text(parts[4], 100, true);
      const eventRow = await findEvent(slug);
      const isAdmin = tokenMatches(bearerToken(request), eventRow.admin_token_hash);
      const removed = await pool.query(
        `delete from event_messages where id = $1 and event_id = $2 and ($3 or participant_id = $4) returning id`,
        [messageId, eventRow.id, isAdmin, participantId]
      );
      if (!removed.rowCount) throw httpError(403, 'Você não pode remover este recado.');
      return send(response, 204);
    }

    if (request.method === 'POST' && parts.length === 4 && parts[3] === 'votes') {
      const voteBody = await readJson(request);
      const result = await withTransaction(async (client) => {
        const locked = await client.query('select * from events where slug = $1 for update', [slug]);
        const eventRow = locked.rows[0];
        if (!eventRow) throw httpError(404, 'Evento não encontrado.');
        if (eventRow.voting_closed) throw httpError(409, 'A votação deste Bora foi encerrada.');
        const event = mapEvent(eventRow);
        const vote = validateVote(voteBody, event);
        const acceptedBefore = await client.query("select count(*)::int as count from votes where event_id = $1 and response = 'accept'", [event.id]);
        const saved = await client.query(
          `insert into votes
            (id, event_id, participant_id, voter_name, response, preferred_options, availability)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (event_id, participant_id) do update set
             voter_name = excluded.voter_name,
             response = excluded.response,
             preferred_options = excluded.preferred_options,
             availability = excluded.availability,
             updated_at = now()
           returning *`,
          [uid('vote'), event.id, vote.participantId, vote.voterName, vote.response,
            JSON.stringify(vote.preferredOptions), JSON.stringify(vote.availability)]
        );
        const accepted = await client.query("select count(*)::int as count from votes where event_id = $1 and response = 'accept'", [event.id]);
        return { eventRow, vote, saved: saved.rows[0], acceptedCount: accepted.rows[0].count, previousAcceptedCount: acceptedBefore.rows[0].count };
      });
      for (const notification of voteNotificationPlan(result.eventRow, { ...result.vote, id: result.saved.id }, result.acceptedCount, `${randomBytes(8).toString('hex')}-${result.saved.id}`, result.previousAcceptedCount)) {
        runInBackground(sendEventPush(result.eventRow, notification.kind, notification.title, notification.body, notification.audience, notification.preference), 'Vote notification');
      }
      return send(response, 200, { vote: mapVote(result.saved, result.vote.participantId) });
    }

    if (request.method === 'PATCH' && parts.length === 3) {
      const patchBody = await readJson(request);
      const result = await withTransaction(async (client) => {
        const locked = await client.query('select * from events where slug = $1 for update', [slug]);
        const current = locked.rows[0];
        if (!current) throw httpError(404, 'Evento não encontrado.');
        if (!tokenMatches(bearerToken(request), current.admin_token_hash)) {
          throw httpError(403, 'Link de administrador inválido.');
        }
        assertPatchMode(current, patchBody);
        assertEventRevision(current, patchBody);
        const legacyAlternatives = (current.alternatives || []).filter((value) => Number.isNaN(Date.parse(value)));
        const input = validateEvent(patchBody, {
          allowedLegacyAlternatives: legacyAlternatives,
          allowMissingTimeZone: current.mode === 'marcar' && !current.event_timezone
        });
        validateFutureSchedule(input, { allowedPastKeys: scheduleEntryKeys(mapEvent(current)) });
        const reminderStartsAt = reminderStartAt(input)?.toISOString() || null;
        const saved = await client.query(
          `update events set
            title=$1, place=$2, description=$3, threshold=$4, starts_at=$5,
            alternatives=$6, days=$7, event_timezone=$8, voting_closed=$9, decided_option=$10, notify_creator_on_vote=$11, reminder_starts_at=$12,
            revision=revision+1,
            decided_at=case when $10::text is null then null when decided_option is distinct from $10 then now() else decided_at end
           where id=$13 and revision=$14 returning *`,
          [input.title, input.place, input.description, input.threshold, input.startsAt,
            JSON.stringify(input.alternatives), JSON.stringify(input.days), input.timeZone,
            input.decidedOption ? true : input.votingClosed, input.decidedOption, input.notifyCreatorOnVote,
            reminderStartsAt, current.id, patchBody.revision]
        );
        if (!saved.rows[0]) throw httpError(409, 'Este Bora foi alterado em outro lugar. Atualize a página e tente novamente.');
        const previousReminderStart = current.reminder_starts_at?.toISOString?.() || current.reminder_starts_at || null;
        if (previousReminderStart !== reminderStartsAt) {
          await client.query(
            `delete from push_notifications
             where event_id = $1 and (kind like 'reminder-24h:%' or kind like 'reminder-2h:%'
               or kind in ('reminder-24h', 'reminder-2h'))`,
            [current.id]
          );
        }
        const retainedSchedule = retainedGuestSchedule(mapEvent(current), input);
        const retainedPreferenceKeys = Object.fromEntries(retainedSchedule.preferredOptions.map((option) => [option, true]));
        await client.query(
          `update votes as vote set
             preferred_options = coalesce((
               select jsonb_agg(selected.value)
               from jsonb_array_elements_text(
                 case when jsonb_typeof(vote.preferred_options) = 'array' then vote.preferred_options else '[]'::jsonb end
               ) selected(value)
               where $1::jsonb ? selected.value
             ), '[]'::jsonb),
             availability = coalesce((
               select jsonb_object_agg(allowed.key, coalesce((
                 select jsonb_agg(selected.value)
                 from jsonb_array_elements_text(
                   case when jsonb_typeof(vote.availability -> allowed.key) = 'array'
                     then vote.availability -> allowed.key else '[]'::jsonb end
                 ) selected(value)
                 where allowed.value ? selected.value
               ), '[]'::jsonb))
               from jsonb_each($2::jsonb) allowed(key, value)
               where vote.availability ? allowed.key
             ), '{}'::jsonb),
             updated_at = now()
           where event_id = $3 and participant_id <> $4`,
          [JSON.stringify(retainedPreferenceKeys), JSON.stringify(retainedSchedule.availability),
            current.id, current.created_by_participant_id]
        );
        const creatorSchedule = creatorVoteSchedule(input);
        await client.query(
          `update votes set response='accept', preferred_options=$1, availability=$2, updated_at=now()
           where event_id=$3 and participant_id=$4`,
          [JSON.stringify(creatorSchedule.preferredOptions), JSON.stringify(creatorSchedule.availability),
            current.id, current.created_by_participant_id]
        );
        return { current, updated: saved.rows[0] };
      });
      for (const notification of eventUpdateNotificationPlan(result.current, result.updated)) {
        runInBackground(sendEventPush(result.updated, notification.kind, notification.title, notification.body, notification.audience, notification.preference), 'Event update notification');
      }
      return send(response, 200, { event: mapEvent(result.updated), isAdmin: true });
    }

    if (request.method === 'DELETE' && parts.length === 3) {
      const result = await withTransaction(async (client) => {
        const locked = await client.query('select * from events where slug = $1 for update', [slug]);
        const current = locked.rows[0];
        if (!current) throw httpError(404, 'Evento não encontrado.');
        if (!tokenMatches(bearerToken(request), current.admin_token_hash)) {
          throw httpError(403, 'Link de administrador inválido.');
        }
        const jobs = [];
        if (pushEnabled) {
          for (const notification of deletionNotificationPlan(current)) {
            const query = pushSubscriptionQuery(current, notification.audience, notification.preference);
            const subscriptions = await client.query(query);
            jobs.push({ notification, subscriptions: subscriptions.rows });
          }
        }
        await client.query('delete from events where id = $1', [current.id]);
        return { current, jobs };
      });
      for (const job of result.jobs) {
        runInBackground(
          sendCancellationPush(job.subscriptions, result.current, job.notification),
          'Deletion notification'
        );
      }
      response.writeHead(204);
      return response.end();
    }
  }

  throw httpError(404, 'Rota não encontrada.');
}

const server = createServer(async (request, response) => {
  if (allowedOrigin) {
    response.setHeader('access-control-allow-origin', allowedOrigin);
    response.setHeader('vary', 'origin');
    response.setHeader('access-control-allow-headers', 'authorization, content-type, x-participant-id');
    response.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    return response.end();
  }

  try {
    enforceRateLimit(request, response);
    await route(request, response);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error(error);
    send(response, status, { error: status >= 500 ? 'Erro interno do servidor.' : error.message });
  }
});

async function shutdown() {
  server.close();
  await pool.end();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, () => console.log(`Bora API listening on http://0.0.0.0:${port}`));
  if (pushEnabled) {
    runInBackground(runReminderScan(), 'Reminder scan');
    setInterval(() => runInBackground(runReminderScan(), 'Reminder scan'), 15 * 60_000).unref();
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
