begin transaction read only;

do $$
declare
  required_migration text;
begin
  if to_regclass('public.schema_migrations') is null
    or to_regclass('public.events') is null
    or to_regclass('public.votes') is null
    or to_regclass('public.participant_recovery_tokens') is null
    or to_regclass('public.push_subscriptions') is null
    or to_regclass('public.push_notifications') is null
    or to_regclass('public.participant_presence') is null then
    raise exception 'restored backup is missing a required Bora table';
  end if;

  for required_migration in
    select name from (values
      ('001_initial.sql'),
      ('002_multi_option_decision.sql'),
      ('003_event_history.sql'),
      ('004_recovery_tokens.sql'),
      ('005_web_push.sql'),
      ('006_presence.sql'),
      ('007_notification_preferences.sql'),
      ('008_push_notification_preferences.sql'),
      ('009_event_timezone.sql'),
      ('010_event_revision.sql'),
      ('011_incremental_reminders.sql')
    ) as required(name)
  loop
    if not exists (select 1 from schema_migrations where name = required_migration) then
      raise exception 'restored backup is missing migration %', required_migration;
    end if;
  end loop;

  -- These zero-row probes still force PostgreSQL to resolve every required
  -- application column. They detect a superficially present but stale schema.
  perform id, slug, admin_token_hash, mode, title, place, description, threshold,
    starts_at, alternatives, days, created_by_name, voting_closed, created_at,
    decided_option, decided_at, created_by_participant_id,
    notify_creator_on_vote, event_timezone, revision, reminder_starts_at from events limit 0;
  perform id, event_id, participant_id, voter_name, response,
    preferred_option, availability, created_at, updated_at, preferred_options
    from votes limit 0;
  perform participant_id, token_hash, created_at, updated_at
    from participant_recovery_tokens limit 0;
  perform id, participant_id, endpoint, p256dh, auth, notify_votes,
    created_at, updated_at, notify_changes, notify_confirmed, notify_threshold,
    notify_upcoming
    from push_subscriptions limit 0;
  perform id, subscription_id, event_id, kind, sent_at
    from push_notifications limit 0;
  perform participant_hash, last_seen_at from participant_presence limit 0;
end $$;

select 'bora-backup-ok'
  || '|migrations=' || (select count(*) from schema_migrations)
  || '|events=' || (select count(*) from events)
  || '|votes=' || (select count(*) from votes)
  || '|recovery_tokens=' || (select count(*) from participant_recovery_tokens)
  || '|push_subscriptions=' || (select count(*) from push_subscriptions)
  || '|push_notifications=' || (select count(*) from push_notifications)
  || '|presence=' || (select count(*) from participant_presence);

rollback;
