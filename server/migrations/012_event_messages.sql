create table if not exists event_messages (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  participant_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_messages_event_created_idx
  on event_messages(event_id, created_at asc, id asc);

alter table push_subscriptions
  add column if not exists notify_messages boolean not null default false;
