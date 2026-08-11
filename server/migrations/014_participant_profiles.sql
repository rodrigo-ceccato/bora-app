create table if not exists participant_profiles (
  participant_id text primary key,
  display_name text not null,
  updated_at timestamptz not null default now()
);
