-- `marcar` stores wall-clock choices. Resolve them against the event's own
-- IANA timezone rather than whichever timezone the API process happens to use.
-- Historical `marcar` rows were deliberately floating wall clocks and contain
-- no evidence of the organizer's zone. Keep them NULL so clients preserve the
-- old floating presentation instead of silently reinterpreting them as UTC.
-- New `marcar` events always persist an explicit IANA zone through the API.
alter table events add column if not exists event_timezone text;
alter table events alter column event_timezone drop not null;
alter table events alter column event_timezone drop default;
