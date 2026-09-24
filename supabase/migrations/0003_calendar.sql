-- 0003_calendar.sql
-- External calendar connections and the events they produce.

-- --------------------------------------------------- calendar connections ---

create table public.calendar_connections (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  provider                text not null,
  external_account_id     text,
  -- Encrypted with AES-256-GCM before insert. The database never sees plaintext,
  -- so a leaked dump alone does not hand over anyone's Google account.
  access_token_encrypted  text,
  refresh_token_encrypted text,
  expires_at              timestamptz,
  sync_status             text not null default 'pending',
  last_synced_at          timestamptz,
  last_error              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint calendar_connections_provider_valid check (provider in ('google', 'ics_url')),
  constraint calendar_connections_status_valid check (sync_status in ('pending', 'active', 'error', 'revoked')),
  -- One connection per provider account per user; re-connecting updates in place.
  unique (user_id, provider, external_account_id)
);

create index calendar_connections_user_idx on public.calendar_connections (user_id);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;

-- Deliberately NO policy granting access to `authenticated`.
--
-- With RLS enabled and no permissive policy, every read and write from the
-- browser is denied. Only server code using the service-role key can touch
-- these rows. OAuth tokens must never be reachable from client JavaScript, even
-- by their owner — an XSS bug would otherwise hand over the calendar account.
revoke all on public.calendar_connections from anon, authenticated;

-- --------------------------------------------------------- calendar events ---

create table public.calendar_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  course_id         uuid references public.courses(id) on delete set null,
  -- Provider's own id, used to recognise an event we have already imported.
  external_event_id text,
  source            text not null default 'manual',
  event_type        text not null default 'other',
  title             text not null,
  description       text,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  -- The wall-clock zone the event was authored in. Needed to render "09:00
  -- lecture" correctly after the student travels or the clocks change.
  timezone          text not null default 'Europe/Stockholm',
  location          text,
  -- Immovable: the planner treats it as a hard obstacle and never schedules over it.
  is_fixed          boolean not null default true,
  is_all_day        boolean not null default false,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint calendar_events_title_not_blank check (length(trim(title)) > 0),
  constraint calendar_events_source_valid check (source in ('manual', 'ics', 'google')),
  constraint calendar_events_type_valid check (event_type in ('lecture', 'seminar', 'lab', 'exam', 'deadline', 'personal', 'other')),
  -- A zero-length or reversed event is meaningless; reject it at the database
  -- rather than trusting every code path to check.
  constraint calendar_events_ends_after_start check (end_at > start_at)
);

-- Every calendar view is "my events between two instants".
create index calendar_events_user_range_idx on public.calendar_events (user_id, start_at);
create index calendar_events_course_idx on public.calendar_events (course_id);

-- Makes duplicate detection on re-import a database guarantee, not a hope.
create unique index calendar_events_external_unique_idx
  on public.calendar_events (user_id, source, external_event_id)
  where external_event_id is not null;

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

create policy "calendar_events_own_rows" on public.calendar_events
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
