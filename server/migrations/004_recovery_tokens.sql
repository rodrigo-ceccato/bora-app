create table if not exists participant_recovery_tokens (
  participant_id text primary key,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
