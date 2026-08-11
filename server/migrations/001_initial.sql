create table if not exists events (
  id text primary key,
  slug text unique not null,
  admin_token_hash text not null,
  mode text not null check (mode in ('agora', 'mais-tarde', 'marcar')),
  title text not null,
  place text not null,
  description text not null default '',
  threshold integer not null check (threshold >= 2),
  starts_at timestamptz,
  alternatives jsonb not null default '[]'::jsonb,
  days jsonb not null default '[]'::jsonb,
  created_by_name text not null,
  voting_closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists votes (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  participant_id text not null,
  voter_name text not null,
  response text not null check (response in ('accept', 'decline', 'maybe')),
  preferred_option text,
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, participant_id)
);

create index if not exists events_slug_idx on events(slug);
create index if not exists votes_event_id_idx on votes(event_id);
