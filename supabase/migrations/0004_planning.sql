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
