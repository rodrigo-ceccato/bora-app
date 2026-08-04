create table if not exists push_subscriptions (
  id text primary key,
  participant_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_participant_idx on push_subscriptions(participant_id);

create table if not exists push_notifications (
  id bigserial primary key,
  subscription_id text not null references push_subscriptions(id) on delete cascade,
  event_id text not null references events(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  unique (subscription_id, event_id, kind)
);
