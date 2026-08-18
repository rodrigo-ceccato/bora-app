create index if not exists participant_activity_state_activity_key_idx
  on participant_activity_state (activity_key);

drop index if exists participant_activity_state_participant_idx;
