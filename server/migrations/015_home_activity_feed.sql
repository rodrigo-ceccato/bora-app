create table if not exists event_activities (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  kind text not null check (kind in ('vote', 'message', 'event_changed', 'final_selected', 'threshold_reached')),
  actor_participant_id text not null,
  aggregation_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, kind, aggregation_key)
);

create index if not exists event_activities_recent_idx
  on event_activities (updated_at desc, event_id);

create table if not exists participant_activity_state (
  participant_id text not null,
  activity_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  primary key (participant_id, activity_key)
);

create index if not exists participant_activity_state_participant_idx
  on participant_activity_state (participant_id, activity_key);
