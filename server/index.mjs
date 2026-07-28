import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pool, withTransaction } from './db.mjs';

const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.CORS_ORIGIN || '';
const maxBodyBytes = 256 * 1024;
const modes = new Set(['agora', 'mais-tarde', 'marcar']);
const responses = new Set(['accept', 'decline', 'maybe']);
const rateBuckets = new Map();

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const received = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function uid(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function slugify(title) {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'bora';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

function text(value, maxLength, required = false) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw httpError(400, 'Preencha todos os campos obrigatórios.');
  if (normalized.length > maxLength) throw httpError(400, `Use no máximo ${maxLength} caracteres.`);
  return normalized;
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 999) {
    throw httpError(400, 'O mínimo de confirmações deve ser um inteiro entre 1 e 999.');
  }
  return number;
}

function validIsoDate(value, required = false) {
  if (!value && !required) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw httpError(400, 'Data ou horário inválido.');
  }
  return value;
}

function validateDays(value) {
  if (!Array.isArray(value)) throw httpError(400, 'Dias e horários inválidos.');
  if (value.length > 14) throw httpError(400, 'Use no máximo 14 dias.');
  return value.map((day) => {
    const slots = Array.isArray(day?.slots)
      ? Array.from(new Set(day.slots.filter((slot) => typeof slot === 'string' && /^\d{2}:\d{2}$/.test(slot))))
      : [];
    if (!day?.id || !day?.date || !slots.length) throw httpError(400, 'Cada dia precisa ter data e pelo menos um horário.');
    return {
      id: text(day.id, 100, true),
      label: text(day.label, 80, true),
      date: text(day.date, 10, true),
      slots: slots.slice(0, 48)
    };
  });
}

function validateEvent(input) {
  const mode = modes.has(input?.mode) ? input.mode : null;
  if (!mode) throw httpError(400, 'Tipo de Bora inválido.');
  return {
    mode,
    title: text(input.title, 120, true),
    place: text(input.place, 240, true),
    description: text(input.description, 1000),
    threshold: positiveInteger(input.threshold),
    startsAt: mode === 'marcar' ? null : validIsoDate(input.startsAt, true),
    alternatives: mode === 'mais-tarde' && Array.isArray(input.alternatives)
      ? Array.from(new Set(input.alternatives.map((item) => text(item, 80)).filter(Boolean))).slice(0, 12)
      : [],
    days: mode === 'marcar' ? validateDays(input.days) : [],
    createdByName: text(input.createdByName, 80, true),
    votingClosed: Boolean(input.votingClosed)
  };
}

function validateVote(input, event) {
  const response = responses.has(input?.response) ? input.response : null;
  if (!response) throw httpError(400, 'Resposta inválida.');
  const participantId = text(input.participantId, 100, true);
  const availability = input.availability && typeof input.availability === 'object' && !Array.isArray(input.availability)
    ? input.availability
    : {};
  const allowedSlots = new Map(event.days.flatMap((day) => day.slots.map((slot) => [`${day.id}:${slot}`, true])));
  const cleanedAvailability = Object.fromEntries(Object.entries(availability).map(([dayId, slots]) => [
    dayId,
    Array.isArray(slots)
      ? Array.from(new Set(slots.filter((slot) => allowedSlots.has(`${dayId}:${slot}`))))
      : []
  ]));
  const selectedSlots = Object.values(cleanedAvailability).flat();
  if (event.mode === 'marcar' && response !== 'decline' && selectedSlots.length === 0) {
    throw httpError(400, 'Marque pelo menos um horário ou selecione “Não posso”.');
  }
  return {
    participantId,
    voterName: text(input.voterName, 80, true),
    response,
    preferredOption: event.mode === 'mais-tarde' && response !== 'decline'
      ? text(input.preferredOption, 80, true)
      : null,
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
    createdByName: row.created_by_name,
    votingClosed: row.voting_closed,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function mapVote(row, viewerParticipantId = '') {
  return {
    id: row.id,
    eventId: row.event_id,
    isOwn: Boolean(viewerParticipantId && row.participant_id === viewerParticipantId),
    voterName: row.voter_name,
    response: row.response,
    preferredOption: row.preferred_option || undefined,
    availability: row.availability || {},
    createdAt: row.created_at?.toISOString?.() || row.created_at
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function bearerToken(request) {
  const authorization = request.headers.authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function enforceRateLimit(request, response) {
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method || '')) return;
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || request.socket.remoteAddress || 'unknown';
  const isCreation = request.method === 'POST' && request.url === '/api/events';
  const limit = isCreation ? 12 : 90;
  const windowMs = isCreation ? 15 * 60_000 : 60_000;
  const key = `${isCreation ? 'create' : 'mutation'}:${address}`;
  const now = Date.now();
  const current = rateBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) {
    response.setHeader('retry-after', String(Math.ceil((bucket.resetAt - now) / 1000)));
    throw httpError(429, 'Muitas tentativas. Aguarde um pouco e tente novamente.');
  }
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
}

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

async function findEvent(slug) {
  const result = await pool.query('select * from events where slug = $1', [slug]);
  if (!result.rows[0]) throw httpError(404, 'Evento não encontrado.');
  return result.rows[0];
}

async function requireAdmin(request, slug) {
  const event = await findEvent(slug);
  if (!tokenMatches(bearerToken(request), event.admin_token_hash)) {
    throw httpError(403, 'Link de administrador inválido.');
  }
  return event;
}

async function route(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    await pool.query('select 1');
    return send(response, 200, { status: 'ok' });
  }

  if (request.method === 'POST' && url.pathname === '/api/events') {
    const body = await readJson(request);
    const eventInput = validateEvent(body.event || body);
    const participantId = text(body.participantId, 100, true);
    const eventId = uid('evt');
    const voteId = uid('vote');
    const slug = slugify(eventInput.title);
    const adminToken = `adm_${randomBytes(32).toString('base64url')}`;
    const availability = eventInput.mode === 'marcar'
      ? Object.fromEntries(eventInput.days.map((day) => [day.id, [...day.slots]]))
      : {};
    const preferredOption = eventInput.mode === 'mais-tarde'
      ? text(body.creatorPreferredOption, 80, true)
      : null;

    const result = await withTransaction(async (client) => {
      const insertedEvent = await client.query(
        `insert into events
          (id, slug, admin_token_hash, mode, title, place, description, threshold, starts_at, alternatives, days, created_by_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
        [eventId, slug, tokenHash(adminToken), eventInput.mode, eventInput.title, eventInput.place,
          eventInput.description, eventInput.threshold, eventInput.startsAt,
          JSON.stringify(eventInput.alternatives), JSON.stringify(eventInput.days), eventInput.createdByName]
      );
      const insertedVote = await client.query(
        `insert into votes
          (id, event_id, participant_id, voter_name, response, preferred_option, availability)
         values ($1,$2,$3,$4,'accept',$5,$6) returning *`,
        [voteId, eventId, participantId, eventInput.createdByName, preferredOption, JSON.stringify(availability)]
      );
      return { event: insertedEvent.rows[0], vote: insertedVote.rows[0] };
    });
    return send(response, 201, {
      event: mapEvent(result.event),
      votes: [mapVote(result.vote, participantId)],
      adminToken,
      isAdmin: true
    });
  }

  if (parts[0] === 'api' && parts[1] === 'events' && parts[2]) {
    const slug = decodeURIComponent(parts[2]);

    if (request.method === 'GET' && parts.length === 3) {
      const eventRow = await findEvent(slug);
      const votes = await pool.query('select * from votes where event_id = $1 order by updated_at desc', [eventRow.id]);
      const viewerParticipantId = text(request.headers['x-participant-id'], 100);
      return send(response, 200, {
        event: mapEvent(eventRow),
        votes: votes.rows.map((vote) => mapVote(vote, viewerParticipantId)),
        isAdmin: tokenMatches(bearerToken(request), eventRow.admin_token_hash)
      });
    }

    if (request.method === 'POST' && parts[3] === 'votes') {
      const eventRow = await findEvent(slug);
      if (eventRow.voting_closed) throw httpError(409, 'A votação deste Bora foi encerrada.');
      const event = mapEvent(eventRow);
      const vote = validateVote(await readJson(request), event);
      const result = await pool.query(
        `insert into votes
          (id, event_id, participant_id, voter_name, response, preferred_option, availability)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (event_id, participant_id) do update set
           voter_name = excluded.voter_name,
           response = excluded.response,
           preferred_option = excluded.preferred_option,
           availability = excluded.availability,
           updated_at = now()
         returning *`,
        [uid('vote'), event.id, vote.participantId, vote.voterName, vote.response,
          vote.preferredOption, JSON.stringify(vote.availability)]
      );
      return send(response, 200, { vote: mapVote(result.rows[0], vote.participantId) });
    }

    if (request.method === 'PATCH' && parts.length === 3) {
      const current = await requireAdmin(request, slug);
      const input = validateEvent(await readJson(request));
      const result = await pool.query(
        `update events set
          title=$1, place=$2, description=$3, threshold=$4, starts_at=$5,
          alternatives=$6, days=$7, voting_closed=$8
         where id=$9 returning *`,
        [input.title, input.place, input.description, input.threshold, input.startsAt,
          JSON.stringify(input.alternatives), JSON.stringify(input.days), input.votingClosed, current.id]
      );
      return send(response, 200, { event: mapEvent(result.rows[0]), isAdmin: true });
    }

    if (request.method === 'DELETE' && parts.length === 3) {
      const current = await requireAdmin(request, slug);
      await pool.query('delete from events where id = $1', [current.id]);
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
    response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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

server.listen(port, () => console.log(`Bora API listening on http://0.0.0.0:${port}`));

async function shutdown() {
  server.close();
  await pool.end();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
