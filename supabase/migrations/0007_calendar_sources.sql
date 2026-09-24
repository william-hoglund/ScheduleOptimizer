-- 0007_calendar_sources.sql
-- Where an imported event came from, and what that means for studying.
--
-- Two things this makes possible:
--
--  1. **Several timetables at once.** A student taking courses from two
--     programmes imports two schedules; a job adds a third calendar. Until now
--     every imported event was just `source = 'ics'` with no identity, so they
--     could not be told apart, filtered, re-imported or removed separately.
--
--  2. **A working day that actually costs something.** A 45-minute stand-up is
--     an ordinary hole in the day. Eight hours at the office is not — after it
--     there is no evening study session, whatever the calendar's free space
--     says. That is a *day-level* effect and it depends on how long the day
--     was, which is why it is a threshold rather than a flag.

create table public.calendar_sources (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  name                   text not null,
  -- What kind of commitment this calendar represents. Only `work` normally
  -- carries a day effect, but the column does not assume that.
  kind                   text not null default 'study',
  color                  text,
  -- Where the events came from, for re-importing the same feed.
  import_url             text,
  last_imported_at       timestamptz,

  -- --- day effect -----------------------------------------------------------
  -- What a day dominated by this calendar does to study time:
  --   none   — nothing beyond blocking the hours themselves
  --   reduce — that day's study capacity drops to `reduced_daily_minutes`
  --   block  — no study is planned on that day at all
  day_effect             text not null default 'none',
  -- Minutes of this calendar's events on one local day before the effect
  -- applies. 360 = a six-hour day. Below the threshold, an event is just an
  -- event.
  day_effect_threshold_minutes integer not null default 360,
  -- What is left on an affected day when the effect is `reduce`.
  reduced_daily_minutes  integer not null default 30,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint calendar_sources_name_not_blank check (length(trim(name)) > 0),
  constraint calendar_sources_kind_valid check (kind in ('study', 'work', 'personal')),
  constraint calendar_sources_effect_valid check (day_effect in ('none', 'reduce', 'block')),
  -- A threshold of zero would make every event take the whole day; a day is
  -- 1440 minutes, so anything above that could never trigger.
  constraint calendar_sources_threshold_range check (day_effect_threshold_minutes between 1 and 1440),
  constraint calendar_sources_reduced_range check (reduced_daily_minutes between 0 and 1440),
  -- Two calendars called "Work" would be indistinguishable in every list.
  unique (user_id, name)
);

create index calendar_sources_user_idx on public.calendar_sources (user_id);

create trigger calendar_sources_set_updated_at
  before update on public.calendar_sources
  for each row execute function public.set_updated_at();

alter table public.calendar_sources enable row level security;

create policy "calendar_sources_own_rows" on public.calendar_sources
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------- events belong to one ---

-- `on delete set null`, not cascade: removing a calendar must not silently take
-- a term of lectures with it. Deleting the events is a separate, explicit act.
alter table public.calendar_events
  add column source_id uuid references public.calendar_sources(id) on delete set null;

create index calendar_events_source_idx on public.calendar_events (source_id);

-- Re-importing a feed matches on the provider's own id *within that calendar*.
-- The old index keyed on (user, source, external id), which collided as soon as
-- two university feeds used the same UID scheme — they do.
drop index if exists calendar_events_external_unique_idx;

create unique index calendar_events_external_unique_idx
  on public.calendar_events (user_id, source, source_id, external_event_id)
  where external_event_id is not null and source_id is not null;

-- Events imported before this migration have no calendar of their own. They
-- keep the old shape, and the old uniqueness rule still has to hold for them.
create unique index calendar_events_external_legacy_idx
  on public.calendar_events (user_id, source, external_event_id)
  where external_event_id is not null and source_id is null;
