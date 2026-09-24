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
