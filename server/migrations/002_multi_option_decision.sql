alter table events add column if not exists decided_option text;
alter table events add column if not exists decided_at timestamptz;

alter table votes add column if not exists preferred_options jsonb not null default '[]'::jsonb;

-- Preserve historical single-choice votes. The old column remains temporarily
-- for rollback safety; all new reads and writes use preferred_options.
update votes
set preferred_options = jsonb_build_array(preferred_option)
where preferred_option is not null
  and preferred_options = '[]'::jsonb;
