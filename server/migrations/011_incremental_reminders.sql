-- Store the resolved instant used by reminder scans. This keeps the recurring
-- worker off JSON schedules and allows PostgreSQL to seek only the two due
-- windows instead of reading every event.
alter table events add column if not exists reminder_starts_at timestamptz;

-- Backfill legacy rows defensively. Historical rows predate strict date,
-- option, and timezone validation, so one malformed event must not abort the
-- whole migration.
do $$
declare
  event_row record;
  resolved_start timestamptz;
begin
  for event_row in
    select id, mode, starts_at, decided_option, days, event_timezone
    from events
    where reminder_starts_at is null
  loop
    resolved_start := null;
    begin
      if event_row.mode = 'agora' then
        resolved_start := event_row.starts_at;
      elsif event_row.mode = 'mais-tarde' and event_row.decided_option is not null then
        resolved_start := event_row.decided_option::timestamptz;
      elsif event_row.mode = 'marcar' and event_row.decided_option is not null then
        select (((day_item ->> 'date')::date + right(event_row.decided_option, 5)::time)
                at time zone event_row.event_timezone)
          into resolved_start
          from jsonb_array_elements(event_row.days) as day_item
         where day_item ->> 'id' = left(event_row.decided_option, char_length(event_row.decided_option) - 6)
         limit 1;
      end if;
      update events set reminder_starts_at = resolved_start where id = event_row.id;
    exception when others then
      raise warning 'Could not resolve reminder instant for legacy event %', event_row.id;
    end;
  end loop;
end $$;

create index if not exists events_reminder_starts_at_idx
  on events (reminder_starts_at, id)
  where reminder_starts_at is not null;

-- Cursor pagination uses immutable creation time plus the unique vote id.
create index if not exists votes_event_created_id_idx
  on votes (event_id, created_at desc, id desc);
