-- Bora MVP Supabase schema
-- Run this in the Supabase SQL editor, then add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id text primary key,
  slug text unique not null,
  admin_token text not null,
  mode text not null check (mode in ('agora', 'mais-tarde', 'marcar')),
  title text not null,
  place text not null,
  description text,
  threshold integer not null default 1,
  starts_at timestamptz,
  alternatives jsonb not null default '[]'::jsonb,
  days jsonb not null default '[]'::jsonb,
  created_by_name text,
  voting_closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id text primary key,
  event_id text not null references public.events(id) on delete cascade,
  voter_name text not null,
  response text not null check (response in ('accept', 'decline', 'maybe')),
  preferred_option text,
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.votes enable row level security;

-- Anonymous link participation: anyone with a link can read events and votes and submit a vote.
-- Admin mutation should eventually move to an Edge Function that verifies admin_token server-side.
create policy "public events are readable" on public.events for select using (true);
create policy "public events can be created" on public.events for insert with check (true);
create policy "mvp admin-token event updates" on public.events for update using (true) with check (true);
create policy "public votes are readable" on public.votes for select using (true);
create policy "public votes can be created" on public.votes for insert with check (true);

create index if not exists events_slug_idx on public.events(slug);
create index if not exists votes_event_id_idx on public.votes(event_id);

-- Let linked event pages update as votes and event edits arrive.
-- Ignore the duplicate-table error when this script is run again.
do $$ begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.votes;
exception when duplicate_object then null;
end $$;
