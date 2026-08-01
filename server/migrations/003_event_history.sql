alter table events add column if not exists created_by_participant_id text;

-- Best-effort recovery for pre-history events: their creator vote is the first
-- vote by the saved creator name. New events always store this explicitly.
update events as event
set created_by_participant_id = (
  select vote.participant_id
  from votes as vote
  where vote.event_id = event.id
    and vote.voter_name = event.created_by_name
  order by vote.created_at asc
  limit 1
)
where event.created_by_participant_id is null;

create index if not exists events_created_by_participant_idx
  on events (created_by_participant_id, starts_at desc, created_at desc);
create index if not exists votes_participant_event_idx
  on votes (participant_id, event_id);
