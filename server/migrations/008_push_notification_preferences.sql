alter table push_subscriptions add column if not exists notify_votes boolean not null default true;
alter table push_subscriptions add column if not exists notify_changes boolean not null default true;
alter table push_subscriptions add column if not exists notify_confirmed boolean not null default true;
alter table push_subscriptions add column if not exists notify_threshold boolean not null default true;
alter table push_subscriptions add column if not exists notify_upcoming boolean not null default true;
