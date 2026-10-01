-- 0013_schedule_image_source.sql
-- Lets `calendar_events.source` record "read off a photo of a timetable",
-- the one import path that isn't a file or an OAuth account.
--
-- A plain `alter table ... add constraint` with the same name would collide,
-- so the existing check is dropped and recreated with the new value added —
-- the standard way to widen a Postgres check constraint.

alter table public.calendar_events
  drop constraint calendar_events_source_valid;

alter table public.calendar_events
  add constraint calendar_events_source_valid
    check (source in ('manual', 'ics', 'google', 'schedule_image'));
