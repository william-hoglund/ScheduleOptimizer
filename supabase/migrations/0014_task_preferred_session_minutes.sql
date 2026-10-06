-- 0014_task_preferred_session_minutes.sql
-- Lets a single task ask for a different session length than the student's
-- usual preference — "give me long sessions for the final project" — without
-- changing `study_preferences.preferred_session_minutes`, which is global.
--
-- Null (the default) means "use the usual preference", not zero minutes —
-- same convention `estimated_minutes` already follows elsewhere for "not
-- stated" (see AGENTS.md's to-dos note). The planner engine falls back to
-- `preferences.preferredSessionMinutes` whenever this is null.

alter table public.tasks
  add column preferred_session_minutes integer;

alter table public.tasks
  add constraint tasks_preferred_session_minutes_range
    check (preferred_session_minutes is null or preferred_session_minutes between 15 and 480);
