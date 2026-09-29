-- =============================================================
-- AI Study Planner — complete schema
--
-- GENERATED FILE. Do not edit; edit supabase/migrations/*.sql and
-- re-run `npm run db:bundle`.
--
-- To apply: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run.
--
-- Safe to run once on an empty project. Running it twice will error on
-- "already exists", which is intentional: it stops a second run from
-- silently doing half a job.
--
-- Files included: 12
-- Generated:      2026-09-29T12:33:32.563Z
-- =============================================================


-- <<<<<<<<<<<<<<<< 0001_foundation.sql >>>>>>>>>>>>>>>>

-- 0001_foundation.sql
-- Shared helpers and the profiles table.
--
-- Row Level Security convention used throughout this project:
--   every table carries user_id, and a single "for all" policy restricts every
--   operation to auth.uid() = user_id. One policy per table rather than four
--   makes it possible to audit at a glance that nothing was missed.

-- ---------------------------------------------------------------- helpers ---

-- Keeps updated_at honest. Attached to every table that has the column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles ---

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text,
  timezone             text not null default 'Europe/Stockholm',
  locale               text not null default 'en',
  onboarding_completed boolean not null default false,
  -- Which onboarding step the student reached, so a half-finished signup can be
  -- resumed instead of restarted (brief §11: "Save each onboarding step").
  onboarding_step      smallint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint profiles_locale_valid check (locale in ('en', 'sv')),
  constraint profiles_onboarding_step_range check (onboarding_step between 0 and 6)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- profiles keys on id (it IS the auth user), not user_id.
create policy "profiles_own_row" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------- profile auto-creation ---

-- Creates the profile row the moment a user registers, so the app never has to
-- cope with a signed-in user who has no profile.
--
-- security definer: runs as the function owner so it can write to public.profiles
-- regardless of the caller's permissions.
-- set search_path = '': forces fully-qualified names, closing a known
-- privilege-escalation route where a caller shadows a table name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, timezone, locale)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Europe/Stockholm'),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- <<<<<<<<<<<<<<<< 0002_academic.sql >>>>>>>>>>>>>>>>

-- 0002_academic.sql
-- Institutions, degree programs, courses, tasks and task dependencies.

-- ----------------------------------------------------------- institutions ---

create table public.institutions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  type       text not null default 'university',
  created_at timestamptz not null default now(),

  constraint institutions_name_not_blank check (length(trim(name)) > 0),
  constraint institutions_type_valid check (type in ('university', 'college', 'school', 'other'))
);

create index institutions_user_idx on public.institutions (user_id);

-- --------------------------------------------------------------- programs ---

create table public.programs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  institution_id  uuid references public.institutions(id) on delete set null,
  name            text not null,
  start_date      date,
  end_date        date,
  color           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint programs_name_not_blank check (length(trim(name)) > 0),
  constraint programs_dates_ordered check (end_date is null or start_date is null or end_date >= start_date)
);

create index programs_user_idx on public.programs (user_id);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- courses ---

create table public.courses (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  program_id             uuid references public.programs(id) on delete set null,
  code                   text,
  name                   text not null,
  description            text,
  color                  text,
  -- 1 = easy, 5 = very hard. Feeds the planner's energy matching.
  difficulty             smallint not null default 3,
  -- 1 = low, 5 = critical. Feeds the priority score.
  priority               smallint not null default 3,
  target_grade           text,
  estimated_weekly_hours numeric(5, 2),
  start_date             date,
  end_date               date,
  archived               boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint courses_name_not_blank check (length(trim(name)) > 0),
  constraint courses_difficulty_range check (difficulty between 1 and 5),
  constraint courses_priority_range check (priority between 1 and 5),
  constraint courses_weekly_hours_sane check (estimated_weekly_hours is null or (estimated_weekly_hours >= 0 and estimated_weekly_hours <= 168)),
  constraint courses_dates_ordered check (end_date is null or start_date is null or end_date >= start_date)
);

-- Course lists are almost always "mine, not archived".
create index courses_user_active_idx on public.courses (user_id) where archived = false;
create index courses_program_idx on public.courses (program_id);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ tasks ---

create table public.tasks (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  course_id              uuid references public.courses(id) on delete cascade,
  -- Subtasks point at their parent. Deleting a parent removes its subtasks.
  parent_task_id         uuid references public.tasks(id) on delete cascade,
  title                  text not null,
  description            text,
  task_type              text not null default 'assignment',
  status                 text not null default 'not_started',
  priority               smallint not null default 3,
  difficulty             smallint not null default 3,
  deadline               timestamptz,
  estimated_minutes      integer not null default 0,
  completed_minutes      integer not null default 0,
  -- Generated, not stored independently: an application-maintained copy would
  -- eventually drift out of sync with the other two columns.
  remaining_minutes      integer generated always as (greatest(estimated_minutes - completed_minutes, 0)) stored,
  preferred_study_method text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint tasks_title_not_blank check (length(trim(title)) > 0),
  constraint tasks_type_valid check (task_type in ('assignment', 'exam', 'reading', 'project', 'lab', 'presentation', 'revision', 'other')),
  constraint tasks_status_valid check (status in ('not_started', 'in_progress', 'completed', 'cancelled')),
  constraint tasks_priority_range check (priority between 1 and 5),
  constraint tasks_difficulty_range check (difficulty between 1 and 5),
  constraint tasks_estimated_non_negative check (estimated_minutes >= 0),
  constraint tasks_completed_non_negative check (completed_minutes >= 0),
  constraint tasks_method_valid check (
    preferred_study_method is null
    or preferred_study_method in ('pomodoro', 'active_recall', 'spaced_repetition', 'deep_work', 'interleaving', 'group_work')
  ),
  constraint tasks_not_own_parent check (parent_task_id is null or parent_task_id <> id)
);

-- The planner's hottest query: open work with a deadline, soonest first.
create index tasks_user_deadline_idx on public.tasks (user_id, deadline)
  where status <> 'completed' and status <> 'cancelled';
create index tasks_course_idx on public.tasks (course_id);
create index tasks_parent_idx on public.tasks (parent_task_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------- task dependencies ---

-- Many-to-many: "finish A before starting B". A join table rather than an array
-- column so the graph can be walked in both directions.
create table public.task_dependencies (
  task_id            uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now(),

  primary key (task_id, depends_on_task_id),
  constraint task_dependencies_no_self_reference check (task_id <> depends_on_task_id)
);

create index task_dependencies_user_idx on public.task_dependencies (user_id);
create index task_dependencies_reverse_idx on public.task_dependencies (depends_on_task_id);

-- ------------------------------------------------------------------- RLS ---

alter table public.institutions      enable row level security;
alter table public.programs          enable row level security;
alter table public.courses           enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_dependencies enable row level security;

create policy "institutions_own_rows" on public.institutions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "programs_own_rows" on public.programs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "courses_own_rows" on public.courses
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks_own_rows" on public.tasks
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "task_dependencies_own_rows" on public.task_dependencies
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- <<<<<<<<<<<<<<<< 0003_calendar.sql >>>>>>>>>>>>>>>>

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


-- <<<<<<<<<<<<<<<< 0004_planning.sql >>>>>>>>>>>>>>>>

-- 0004_planning.sql
-- Study preferences, availability, generated plans and their sessions.

-- ------------------------------------------------------ study preferences ---

create table public.study_preferences (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null unique references auth.users(id) on delete cascade,
  weekly_target_minutes     integer not null default 600,
  minimum_session_minutes   integer not null default 25,
  maximum_session_minutes   integer not null default 120,
  preferred_session_minutes integer not null default 50,
  maximum_daily_minutes     integer not null default 300,
  -- Wall-clock, not an instant. "I study from 08:00" must stay 08:00 through a
  -- daylight-saving change, so this is a `time`, never a timestamptz.
  earliest_start_time       time not null default '08:00',
  latest_end_time           time not null default '21:00',
  -- ISO weekday numbers, 1 = Monday .. 7 = Sunday.
  preferred_days            smallint[] not null default '{1,2,3,4,5}',
  avoid_days                smallint[] not null default '{}',
  weekend_allowed           boolean not null default false,
  break_method              text not null default 'pomodoro',
  -- Share of available time left deliberately empty, so the plan survives a bad day.
  buffer_percentage         smallint not null default 15,
  planning_flexibility      text not null default 'balanced',
  -- e.g. {"morning":"high","afternoon":"medium","evening":"low"}
  energy_profile            jsonb not null default '{"morning":"high","afternoon":"medium","evening":"low"}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint study_preferences_session_bounds check (
    minimum_session_minutes > 0
    and minimum_session_minutes <= preferred_session_minutes
    and preferred_session_minutes <= maximum_session_minutes
  ),
  constraint study_preferences_daily_covers_session check (maximum_daily_minutes >= minimum_session_minutes),
  constraint study_preferences_window_ordered check (latest_end_time > earliest_start_time),
  constraint study_preferences_buffer_range check (buffer_percentage between 0 and 50),
  constraint study_preferences_break_method_valid check (break_method in ('pomodoro', 'fifty_ten', 'ninety_twenty', 'none')),
  constraint study_preferences_flexibility_valid check (planning_flexibility in ('strict', 'balanced', 'flexible'))
);

create trigger study_preferences_set_updated_at
  before update on public.study_preferences
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------ availability rules ---

create table public.availability_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- ISO weekday, 1 = Monday .. 7 = Sunday.
  day_of_week smallint not null,
  start_time  time not null,
  end_time    time not null,
  rule_type   text not null default 'available',
  priority    smallint not null default 0,
  label       text,
  created_at  timestamptz not null default now(),

  constraint availability_rules_day_range check (day_of_week between 1 and 7),
  constraint availability_rules_times_ordered check (end_time > start_time),
  constraint availability_rules_type_valid check (rule_type in ('available', 'unavailable', 'preferred'))
);

create index availability_rules_user_day_idx on public.availability_rules (user_id, day_of_week);

-- ----------------------------------------------------------- study plans ---

create table public.study_plans (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  start_date            date not null,
  end_date              date not null,
  -- draft until the student approves it: nothing reaches the real calendar
  -- until they say so.
  status                text not null default 'draft',
  generation_version    text not null default 'v1',
  total_planned_minutes integer not null default 0,
  explanation           text,
  warnings              jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  approved_at           timestamptz,

  constraint study_plans_dates_ordered check (end_date >= start_date),
  constraint study_plans_status_valid check (status in ('draft', 'approved', 'superseded', 'discarded'))
);

create index study_plans_user_status_idx on public.study_plans (user_id, status, start_date desc);

-- -------------------------------------------------------- study sessions ---

create table public.study_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  study_plan_id     uuid references public.study_plans(id) on delete cascade,
  task_id           uuid references public.tasks(id) on delete set null,
  course_id         uuid references public.courses(id) on delete set null,
  title             text not null,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  planned_minutes   integer not null,
  completed_minutes integer not null default 0,
  status            text not null default 'planned',
  -- Locked sessions are never moved by automatic rescheduling.
  is_locked         boolean not null default false,
  -- Why the engine put it here, shown to the student as the explanation.
  generation_reason text,
  -- Set when the student drags or edits it; regeneration preserves these.
  manually_modified boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint study_sessions_title_not_blank check (length(trim(title)) > 0),
  constraint study_sessions_ends_after_start check (end_at > start_at),
  constraint study_sessions_planned_positive check (planned_minutes > 0),
  constraint study_sessions_completed_non_negative check (completed_minutes >= 0),
  constraint study_sessions_status_valid check (status in ('planned', 'completed', 'missed', 'partial', 'cancelled'))
);

create index study_sessions_user_range_idx on public.study_sessions (user_id, start_at);
create index study_sessions_plan_idx on public.study_sessions (study_plan_id);
create index study_sessions_task_idx on public.study_sessions (task_id);
-- Drives "what did I miss?" and the rescheduling prompt.
create index study_sessions_user_open_idx on public.study_sessions (user_id, status, start_at)
  where status = 'planned';

create trigger study_sessions_set_updated_at
  before update on public.study_sessions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- planner runs ---

-- Every generation is recorded with its inputs and outputs. This is what makes
-- "why did it produce that plan?" answerable weeks later, and lets a run be
-- replayed against a fixed seed when a test fails.
create table public.planner_runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  study_plan_id     uuid references public.study_plans(id) on delete cascade,
  input_snapshot    jsonb not null,
  result_snapshot   jsonb not null,
  warnings          jsonb not null default '[]'::jsonb,
  algorithm_version text not null,
  seed              text,
  duration_ms       integer,
  created_at        timestamptz not null default now()
);

create index planner_runs_user_idx on public.planner_runs (user_id, created_at desc);

-- ------------------------------------------------------------------- RLS ---

alter table public.study_preferences  enable row level security;
alter table public.availability_rules enable row level security;
alter table public.study_plans        enable row level security;
alter table public.study_sessions     enable row level security;
alter table public.planner_runs       enable row level security;

create policy "study_preferences_own_rows" on public.study_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "availability_rules_own_rows" on public.availability_rules
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "study_plans_own_rows" on public.study_plans
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "study_sessions_own_rows" on public.study_sessions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "planner_runs_own_rows" on public.planner_runs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- <<<<<<<<<<<<<<<< 0005_notifications_privacy.sql >>>>>>>>>>>>>>>>

-- 0005_notifications_privacy.sql
-- Notifications, per-type notification settings, GDPR consent and audit trail.

-- ----------------------------------------------------------- notifications ---

create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null,
  title               text not null,
  body                text,
  scheduled_for       timestamptz not null default now(),
  sent_at             timestamptz,
  read_at             timestamptz,
  status              text not null default 'pending',
  related_entity_type text,
  related_entity_id   uuid,
  created_at          timestamptz not null default now(),

  constraint notifications_type_valid check (type in (
    'session_starting', 'break_time', 'session_ended', 'deadline_approaching',
    'weekly_plan_incomplete', 'session_missed', 'plan_ready'
  )),
  constraint notifications_status_valid check (status in ('pending', 'sent', 'dismissed', 'failed')),
  constraint notifications_entity_type_valid check (
    related_entity_type is null
    or related_entity_type in ('task', 'course', 'study_session', 'study_plan', 'calendar_event')
  )
);

-- The dispatch job's only query: what is due and still unsent.
create index notifications_dispatch_idx on public.notifications (status, scheduled_for)
  where status = 'pending';
-- The bell's unread count.
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;

-- ------------------------------------------------- notification settings ---

-- Separate from study_preferences so muting reminders never touches planning data.
create table public.notification_settings (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users(id) on delete cascade,
  session_starting       boolean not null default true,
  session_starting_lead  smallint not null default 10,
  break_time             boolean not null default true,
  session_ended          boolean not null default false,
  deadline_approaching   boolean not null default true,
  deadline_lead_days     smallint not null default 3,
  weekly_plan_incomplete boolean not null default true,
  session_missed         boolean not null default true,
  -- Channels. In-app is the MVP; the others are prepared but off.
  channel_in_app         boolean not null default true,
  channel_email          boolean not null default false,
  channel_push           boolean not null default false,
  -- No notifications inside this window, whatever else is enabled.
  quiet_hours_start      time,
  quiet_hours_end        time,
  updated_at             timestamptz not null default now(),

  constraint notification_settings_lead_range check (session_starting_lead between 0 and 120),
  constraint notification_settings_deadline_lead_range check (deadline_lead_days between 0 and 30)
);

create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------- user consents ---

-- GDPR: answers "what did I agree to, and when", including withdrawal.
create table public.user_consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  granted      boolean not null,
  granted_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),

  constraint user_consents_type_valid check (consent_type in ('analytics', 'product_improvement', 'ai_processing')),
  unique (user_id, consent_type)
);

-- ------------------------------------------------------------- audit log ---

-- Sensitive changes only: integrations connected or revoked, exports taken,
-- account deletion. Not a general activity feed.
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_user_idx on public.audit_log (user_id, created_at desc);

-- ------------------------------------------------------------------- RLS ---

alter table public.notifications          enable row level security;
alter table public.notification_settings  enable row level security;
alter table public.user_consents          enable row level security;
alter table public.audit_log              enable row level security;

create policy "notifications_own_rows" on public.notifications
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "notification_settings_own_rows" on public.notification_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_consents_own_rows" on public.user_consents
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Read-only from the client: an audit trail the subject can rewrite is not an
-- audit trail. Writes happen server-side with the service-role key.
create policy "audit_log_read_own" on public.audit_log
  for select to authenticated using (auth.uid() = user_id);


-- <<<<<<<<<<<<<<<< 0006_study_groups.sql >>>>>>>>>>>>>>>>

-- 0006_study_groups.sql
-- Private, invite-only study groups ranked on plan adherence.
--
-- Design rationale is in docs/PLAN.md §5b. The short version: members are
-- ranked on how much of their *own* plan they kept, never on hours studied and
-- never on grades — so a lighter week costs nothing, and the ranking cannot be
-- won by sleep deprivation.

-- ----------------------------------------------------------- study groups ---

create table public.study_groups (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  description       text,
  -- Short, human-typeable, and unique. This is the only way in: there is no
  -- public directory and no global ranking.
  join_code         text not null unique,
  -- Sessions the group aims to complete together in a week.
  weekly_session_goal smallint not null default 20,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint study_groups_name_not_blank check (length(trim(name)) > 0),
  constraint study_groups_join_code_shape check (join_code ~ '^[A-Z0-9]{6,10}$'),
  constraint study_groups_goal_range check (weekly_session_goal between 1 and 500)
);

create trigger study_groups_set_updated_at
  before update on public.study_groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- members ---

create table public.study_group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.study_groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member',
  -- What this member lets the group see. Adherence only by default: the group
  -- never learns what someone is studying unless they opt in.
  share_level  text not null default 'adherence',
  display_name text,
  -- Paused members stay in the group but drop off the board, so a hard week
  -- does not force a public exit.
  status       text not null default 'active',
  joined_at    timestamptz not null default now(),

  constraint study_group_members_role_valid check (role in ('owner', 'member')),
  constraint study_group_members_share_valid check (share_level in ('adherence', 'hours', 'courses')),
  constraint study_group_members_status_valid check (status in ('active', 'paused')),
  unique (group_id, user_id)
);

create index study_group_members_user_idx on public.study_group_members (user_id);
create index study_group_members_group_idx on public.study_group_members (group_id);

-- ----------------------------------------------------------------- scores ---

-- Computed server-side from study_sessions. The client never writes here —
-- otherwise the leaderboard would be trivially forged.
create table public.study_group_scores (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.study_groups(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  planned_minutes    integer not null default 0,
  completed_minutes  integer not null default 0,
  -- 0–100. The ranking metric.
  adherence_percent  smallint not null default 0,
  sessions_completed integer not null default 0,
  current_streak_days smallint not null default 0,
  computed_at        timestamptz not null default now(),

  constraint study_group_scores_period_ordered check (period_end >= period_start),
  constraint study_group_scores_adherence_range check (adherence_percent between 0 and 100),
  unique (group_id, user_id, period_start)
);

create index study_group_scores_board_idx
  on public.study_group_scores (group_id, period_start, adherence_percent desc);

-- ------------------------------------------------------------ membership ---

/*
 * Membership lookup that bypasses RLS.
 *
 * This exists to break a recursion. The natural policy on study_group_members
 * is "you may see rows for groups you belong to" — but evaluating that requires
 * querying study_group_members, which re-triggers the same policy, and Postgres
 * fails with infinite recursion.
 *
 * security definer runs the lookup as the function owner, so RLS is not applied
 * inside it and the cycle is broken. set search_path = '' forces fully-qualified
 * names, closing the usual privilege-escalation route.
 */
create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.study_group_members
    where group_id = target_group
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

-- ------------------------------------------------------------------- RLS ---

alter table public.study_groups        enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_scores  enable row level security;

-- Groups are visible to their members, and editable only by their owner.
create policy "study_groups_read_as_member" on public.study_groups
  for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));

create policy "study_groups_insert_own" on public.study_groups
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "study_groups_update_owner" on public.study_groups
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "study_groups_delete_owner" on public.study_groups
  for delete to authenticated
  using (owner_id = auth.uid());

-- Members can see who else is in their groups.
create policy "study_group_members_read" on public.study_group_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));

-- Joining is inserting your own row. The group is found by its code, which the
-- server resolves before this runs.
create policy "study_group_members_join" on public.study_group_members
  for insert to authenticated
  with check (user_id = auth.uid());

-- You may change your own membership (pause, share level, display name) and
-- leave. Nobody can alter anyone else's.
create policy "study_group_members_update_own" on public.study_group_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "study_group_members_leave" on public.study_group_members
  for delete to authenticated
  using (user_id = auth.uid());

-- Scores are readable by the group and writable by nobody. There is
-- deliberately no insert or update policy: the only way a row gets here is
-- through refresh_my_group_scores() below, which computes the numbers itself.
create policy "study_group_scores_read" on public.study_group_scores
  for select to authenticated
  using (public.is_group_member(group_id));

-- ------------------------------------------------------- joining by code ---

/*
 * Resolves an invite code to a group id.
 *
 * Needed because study_groups is only readable by its members — so someone
 * holding a valid code could not look the group up in order to join it.
 *
 * Returns the id and nothing else. A wrong code returns null, which is
 * indistinguishable from a code for a group that exists, so this cannot be used
 * to probe for groups.
 */
create or replace function public.resolve_join_code(code text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id from public.study_groups where join_code = upper(trim(code));
$$;

revoke all on function public.resolve_join_code(text) from public;
grant execute on function public.resolve_join_code(text) to authenticated;

-- ------------------------------------------------------ score computation ---

/*
 * Recomputes the caller's own score for the current week, in every group they
 * belong to.
 *
 * The numbers are derived here, from the caller's own study_sessions — they are
 * never passed in. That is the whole point: a leaderboard whose scores the
 * client could supply is one anyone could forge, and adherence is the only
 * thing this product ranks on.
 *
 * security definer is what lets it write to study_group_scores, which has no
 * insert policy at all. auth.uid() still scopes every read and write to the
 * caller, so it cannot touch anyone else's score.
 */
create or replace function public.refresh_my_group_scores()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  period_start_date date;
  period_end_date date;
  planned integer;
  completed integer;
  finished integer;
  adherence smallint;
begin
  if caller is null then
    return;
  end if;

  -- ISO week: Monday to Sunday, in UTC. Close enough for a weekly board, and
  -- consistent for everyone in a group regardless of their own time zone.
  period_start_date := (date_trunc('week', now() at time zone 'utc'))::date;
  period_end_date := period_start_date + 6;

  select
    coalesce(sum(planned_minutes), 0),
    coalesce(sum(completed_minutes), 0),
    count(*) filter (where status = 'completed')
  into planned, completed, finished
  from public.study_sessions
  where user_id = caller
    and status <> 'cancelled'
    and start_at >= period_start_date::timestamptz
    and start_at < (period_end_date + 1)::timestamptz
    and start_at <= now();

  -- Nothing planned yet means 100%, not 0%: a student who has not been asked to
  -- do anything has not failed to do it.
  adherence := case
    when planned > 0 then least(100, round((completed::numeric / planned) * 100))::smallint
    else 100
  end;

  insert into public.study_group_scores (
    group_id, user_id, period_start, period_end,
    planned_minutes, completed_minutes, adherence_percent, sessions_completed, computed_at
  )
  select
    m.group_id, caller, period_start_date, period_end_date,
    planned, completed, adherence, finished, now()
  from public.study_group_members m
  where m.user_id = caller
  on conflict (group_id, user_id, period_start) do update set
    planned_minutes = excluded.planned_minutes,
    completed_minutes = excluded.completed_minutes,
    adherence_percent = excluded.adherence_percent,
    sessions_completed = excluded.sessions_completed,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function public.refresh_my_group_scores() from public;
grant execute on function public.refresh_my_group_scores() to authenticated;


-- <<<<<<<<<<<<<<<< 0007_calendar_sources.sql >>>>>>>>>>>>>>>>

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


-- <<<<<<<<<<<<<<<< 0008_errands.sql >>>>>>>>>>>>>>>>

-- 0008_errands.sql
-- The rest of the week.
--
-- A student's week is not only coursework. A job application closes on Friday,
-- the dentist is at 14:00 on Thursday, a form has to be posted. Those compete
-- for exactly the same hours as revision, and a planner that does not know
-- about them will keep proposing study time that was never really free.
--
-- They are modelled as tasks rather than as a list beside the app, so the
-- planner schedules them the way it schedules everything else.

alter table public.tasks drop constraint if exists tasks_type_valid;

alter table public.tasks add constraint tasks_type_valid check (
  task_type in (
    -- coursework
    'assignment', 'exam', 'reading', 'project', 'lab', 'presentation', 'revision', 'other',
    -- life
    'application', 'appointment', 'admin', 'errand'
  )
);

-- A to-do with a time of its own.
--
-- The dentist at 14:00 is not something the planner may move: it is something
-- it must plan around. When this is set, the task stops being schedulable work
-- and becomes an obstacle for as long as it takes.
alter table public.tasks add column if not exists fixed_start_at timestamptz;

create index if not exists tasks_user_fixed_start_idx
  on public.tasks (user_id, fixed_start_at)
  where fixed_start_at is not null;


-- <<<<<<<<<<<<<<<< 0009_segments.sql >>>>>>>>>>>>>>>>

-- 0009_segments.sql
-- Who the week belongs to.
--
-- The same engine serves two people with different weeks. A student's time is
-- shaped by a timetable and exams; a working professional's is shaped by a job
-- that takes the whole day and leaves evenings that are already tired. They
-- want the same thing — hours that survive contact with the week — but the
-- defaults, the vocabulary and the number worth watching are not the same.
--
-- One column, because this is framing rather than a different product.

alter table public.profiles
  add column if not exists segment text not null default 'student';

alter table public.profiles drop constraint if exists profiles_segment_valid;

alter table public.profiles add constraint profiles_segment_valid
  check (segment in ('student', 'professional'));


-- <<<<<<<<<<<<<<<< 0010_account_deletion.sql >>>>>>>>>>>>>>>>

-- 0010_account_deletion.sql
-- Deleting your own account, without a service-role key in the app.
--
-- Every table in this schema already carries
-- `user_id uuid not null references auth.users(id) on delete cascade` (or, for
-- profiles, `id references auth.users(id) on delete cascade`) — see 0001-0009.
-- That means one delete against `auth.users` is enough to remove every row
-- this account owns, everywhere, in one transaction. Nothing else needs to
-- change when a new table is added later, as long as it follows the same
-- convention every table here already does.
--
-- security definer is what makes this possible: the function runs with the
-- privileges of whoever created it (the project owner, via the SQL Editor),
-- not the caller's own `authenticated` role, which normally cannot touch
-- `auth.users` at all. auth.uid() still scopes the delete to the caller's own
-- row — there is no argument that names a different user, so there is no way
-- to call this on anyone else's account. set search_path = '' forces every
-- name to be schema-qualified, closing the usual privilege-escalation route
-- through a function that trusts an unqualified name. Same shape as
-- `refresh_my_group_scores()` in 0006_study_groups.sql.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;


-- <<<<<<<<<<<<<<<< 0011_course_knowledge.sql >>>>>>>>>>>>>>>>

-- 0011_course_knowledge.sql
-- Persistent course knowledge: uploaded course documents (syllabi, schedules,
-- assessment guides) turned into structured, source-traceable academic data.
--
-- The core distinction this schema exists to enforce (docs/PLAN.md §40.3):
-- a fact extracted from a document and a suggestion generated by the AI must
-- never be representable as the same kind of row. Every table below that
-- holds extracted information carries `confidence` and `verified_by_user` —
-- there is deliberately no "recommendation" column on any of them. AI-written
-- planning suggestions (prep timelines) are proposed through the existing
-- advisor propose/confirm path (`plannerCommandSchema`), not stored as if
-- they were course facts.
--
-- An assessment is not a new parallel "thing the planner schedules". It is a
-- `tasks` row (the planner already reads deadline/estimated_minutes/status
-- from `tasks`) plus an `assessment_details` row holding the extra syllabus
-- metadata `tasks` has no reason to carry. One source of truth for "what has
-- to be scheduled", same as §13's to-dos are `tasks` rather than a second list.

-- ------------------------------------------------------------- documents ---

create table public.course_documents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  course_id          uuid not null references public.courses(id) on delete cascade,
  file_name          text not null,
  file_size          bigint not null,
  mime_type          text not null,
  -- Path inside the `course-documents` storage bucket. Always
  -- `${user_id}/...` — see the storage policy below, which is what makes that
  -- prefix load-bearing rather than a convention.
  storage_path       text not null unique,
  document_type      text not null default 'other',
  processing_status  text not null default 'pending',
  processing_error   text,
  uploaded_at        timestamptz not null default now(),
  processed_at       timestamptz,

  constraint course_documents_file_name_not_blank check (length(trim(file_name)) > 0),
  constraint course_documents_file_size_positive check (file_size > 0),
  constraint course_documents_type_valid check (
    document_type in ('syllabus', 'schedule', 'assessment_guide', 'reading_list', 'other')
  ),
  constraint course_documents_status_valid check (
    processing_status in ('pending', 'processing', 'completed', 'failed')
  )
);

create index course_documents_course_idx on public.course_documents (course_id);
create index course_documents_user_idx on public.course_documents (user_id);

-- ---------------------------------------------------------- requirements ---
-- Everything from a document that is not itself a scheduled deadline:
-- readings, topics, exam format, grading rules, policies.

create table public.course_requirements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  -- set null, not cascade: deleting the source document must not silently
  -- delete a fact the student has already verified against it.
  document_id   uuid references public.course_documents(id) on delete set null,
  type          text not null,
  title         text not null,
  description   text,
  source_page   integer,
  source_text   text,
  confidence    text not null default 'medium',
  verified_by_user boolean not null default false,
  created_at    timestamptz not null default now(),

  constraint course_requirements_title_not_blank check (length(trim(title)) > 0),
  constraint course_requirements_type_valid check (
    type in ('reading', 'topic', 'exam_format', 'grading', 'policy', 'other')
  ),
  constraint course_requirements_confidence_valid check (confidence in ('high', 'medium', 'low')),
  constraint course_requirements_source_page_positive check (source_page is null or source_page > 0)
);

create index course_requirements_course_idx on public.course_requirements (course_id);
create index course_requirements_document_idx on public.course_requirements (document_id);

-- ------------------------------------------------------- assessment detail ---
-- 1:1 with a `tasks` row. `tasks` already owns deadline / estimated_minutes /
-- status, which is what the planner reads — this table only adds what a
-- syllabus states that a task otherwise has no column for.

create table public.assessment_details (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  task_id           uuid not null unique references public.tasks(id) on delete cascade,
  course_id         uuid not null references public.courses(id) on delete cascade,
  document_id       uuid references public.course_documents(id) on delete set null,
  weight_percent    numeric(5, 2),
  word_count        integer,
  assessment_format text,
  source_page       integer,
  source_text       text,
  confidence        text not null default 'medium',
  verified_by_user  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint assessment_details_weight_range check (
    weight_percent is null or (weight_percent >= 0 and weight_percent <= 100)
  ),
  constraint assessment_details_word_count_positive check (word_count is null or word_count > 0),
  constraint assessment_details_format_valid check (
    assessment_format is null
    or assessment_format in ('individual', 'group', 'presentation', 'exam', 'other')
  ),
  constraint assessment_details_confidence_valid check (confidence in ('high', 'medium', 'low')),
  constraint assessment_details_source_page_positive check (source_page is null or source_page > 0)
);

create index assessment_details_course_idx on public.assessment_details (course_id);
create index assessment_details_document_idx on public.assessment_details (document_id);

create trigger assessment_details_set_updated_at
  before update on public.assessment_details
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- milestones ---
-- Dates that matter but are not themselves a scheduled piece of work: reading
-- week, an assessment period opening, a draft deadline mentioned in passing.

create table public.course_milestones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  document_id   uuid references public.course_documents(id) on delete set null,
  title         text not null,
  milestone_date date not null,
  type          text not null default 'other',
  description   text,
  source_page   integer,
  source_text   text,
  confidence    text not null default 'medium',
  verified_by_user boolean not null default false,
  created_at    timestamptz not null default now(),

  constraint course_milestones_title_not_blank check (length(trim(title)) > 0),
  constraint course_milestones_type_valid check (
    type in ('teaching_period', 'reading_week', 'assessment_period', 'exam_period', 'other')
  ),
  constraint course_milestones_confidence_valid check (confidence in ('high', 'medium', 'low')),
  constraint course_milestones_source_page_positive check (source_page is null or source_page > 0)
);

create index course_milestones_course_date_idx on public.course_milestones (course_id, milestone_date);

-- ------------------------------------------------------- knowledge updates ---
-- A record of what changed when a course document is re-uploaded and a field
-- disagrees with what is already stored. Never applied silently — see
-- `docs/PLAN.md` §40.13: the student reviews and confirms before anything
-- already-scheduled is touched.

create table public.course_knowledge_updates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  document_id  uuid references public.course_documents(id) on delete set null,
  change_type  text not null,
  field_label  text not null,
  old_value    text,
  new_value    text,
  impact       text,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now(),

  constraint course_knowledge_updates_type_valid check (
    change_type in (
      'deadline_changed', 'weight_changed', 'requirement_added',
      'requirement_removed', 'milestone_changed', 'other'
    )
  )
);

create index course_knowledge_updates_course_idx on public.course_knowledge_updates (course_id)
  where resolved = false;

-- ------------------------------------------------------------------- RLS ---

alter table public.course_documents        enable row level security;
alter table public.course_requirements     enable row level security;
alter table public.assessment_details      enable row level security;
alter table public.course_milestones       enable row level security;
alter table public.course_knowledge_updates enable row level security;

create policy "course_documents_own_rows" on public.course_documents
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "course_requirements_own_rows" on public.course_requirements
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "assessment_details_own_rows" on public.assessment_details
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "course_milestones_own_rows" on public.course_milestones
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "course_knowledge_updates_own_rows" on public.course_knowledge_updates
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --------------------------------------------------------------- storage ---
-- Original documents are never discarded (§40.1) — kept in a private bucket,
-- one folder per user, so the same `auth.uid() = user_id` shape RLS uses
-- everywhere else applies here via the path prefix.

insert into storage.buckets (id, name, public)
values ('course-documents', 'course-documents', false)
on conflict (id) do nothing;

create policy "course_documents_storage_own_folder" on storage.objects
  for all to authenticated
  using (bucket_id = 'course-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'course-documents' and (storage.foldername(name))[1] = auth.uid()::text);


-- <<<<<<<<<<<<<<<< 0012_learning_profile.sql >>>>>>>>>>>>>>>>

-- 0012_learning_profile.sql
-- Personal Learning Profile: a persistent, dismissible record of what the
-- system has observed about how this student actually studies, distinct from
-- the explicit preferences already in `study_preferences`.
--
-- Every row here is a *behavioral* observation — never a psychological
-- inference — and every row carries `confidence` and `observation_count` so
-- the UI can say "based on N sessions" rather than presenting a guess as
-- fact. `overridden_by_user` is the override the brief asks for: dismissing
-- an insight is itself the correction, so there is deliberately no separate
-- override-value column (see docs/PLAN.md Session 21).

create table public.learning_profile_insights (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  insight_type       text not null,
  course_id          uuid references public.courses(id) on delete cascade,
  -- Backs the unique index below. Two NULLs are never equal in Postgres, so a
  -- plain unique constraint on (user_id, insight_type, course_id) would
  -- silently allow duplicate global (course_id is null) rows. A generated
  -- column instead of an app-maintained value that could drift — same
  -- reasoning `tasks.remaining_minutes` already follows in this schema.
  scope_key          text generated always as (coalesce(course_id::text, 'global')) stored,
  computed_value     jsonb not null,
  confidence         text not null,
  observation_count  integer not null,
  computed_at        timestamptz not null default now(),
  overridden_by_user boolean not null default false,
  created_at         timestamptz not null default now(),

  constraint learning_profile_insights_type_valid check (
    insight_type in ('best_study_band', 'estimation_bias', 'course_postponement_risk')
  ),
  constraint learning_profile_insights_confidence_valid check (confidence in ('low', 'medium', 'high')),
  constraint learning_profile_insights_observation_count_nonneg check (observation_count >= 0),
  -- course_id is populated for exactly the one per-course insight type.
  constraint learning_profile_insights_course_scope check (
    (insight_type = 'course_postponement_risk') = (course_id is not null)
  )
);

create unique index learning_profile_insights_scope_idx
  on public.learning_profile_insights (user_id, insight_type, scope_key);

-- ------------------------------------------------------------------- RLS ---
-- Single-user, private data — no shared leaderboard concern like
-- `study_group_scores`, so the ordinary authenticated client computing and
-- writing its own rows needs no `security definer` wrapper.

alter table public.learning_profile_insights enable row level security;

create policy "learning_profile_insights_own_rows" on public.learning_profile_insights
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

