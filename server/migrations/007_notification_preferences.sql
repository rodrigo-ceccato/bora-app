alter table events add column if not exists notify_creator_on_vote boolean not null default true;
