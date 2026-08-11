-- Full event edits are optimistic: clients must send the revision they read,
-- and each successful mutation advances it so stale bodies cannot overwrite a
-- newer organizer action.
alter table events add column if not exists revision integer not null default 0;
