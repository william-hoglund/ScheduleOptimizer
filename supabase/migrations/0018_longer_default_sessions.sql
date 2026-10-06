-- 0018_longer_default_sessions.sql
-- Longer study blocks as the standard (Session 33): a 90-minute preferred
-- session, a 3-hour maximum, and "my own way" (no timer rhythm) as the default
-- study style. The planner now sizes blocks from the study style
-- (`break_method`) and joins back-to-back pieces of the same task.
--
-- Existing rows still on the old untouched defaults (50 / 120 / pomodoro) are
-- moved to the new ones; anything a student actually changed is left alone.

alter table public.study_preferences
  alter column preferred_session_minutes set default 90,
  alter column maximum_session_minutes set default 180,
  alter column break_method set default 'none';

update public.study_preferences
   set preferred_session_minutes = 90,
       maximum_session_minutes = greatest(maximum_session_minutes, 180),
       break_method = 'none'
 where preferred_session_minutes in (50, 60)
   and maximum_session_minutes = 120
   and break_method = 'pomodoro';
