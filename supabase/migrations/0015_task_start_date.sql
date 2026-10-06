-- 0015_task_start_date.sql
-- "Don't start studying for this before…" — an exam at the end of the study
-- period should not pull revision into week one just because there is free
-- time now. A local calendar date (not an instant): the planner reads it as
-- the start of that day in the student's own timezone.
--
-- Null (the default) means "no earliest start" — today's behaviour.

alter table public.tasks
  add column start_date date;
