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
