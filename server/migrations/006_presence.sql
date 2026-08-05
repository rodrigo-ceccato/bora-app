create table if not exists participant_presence (
  participant_hash text primary key,
  last_seen_at timestamptz not null default now()
);

create index if not exists participant_presence_last_seen_idx on participant_presence(last_seen_at);
