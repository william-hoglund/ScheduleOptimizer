-- 0017_session_logging.sql
-- Logging what actually happened, for both kinds of time on the calendar:
--
--   * study_sessions.started_at — set when the student presses "Start", so a
--     finished session records the minutes really spent, not the plan.
--   * calendar_events.attendance — whether a class was attended or missed.
--     A missed lecture is what the Learn page's catch-up works from;
--     'caught_up' closes that loop once the student has gone through it.
--
-- Both null by default: nothing is assumed, the student says what happened.

alter table public.study_sessions
  add column started_at timestamptz;

alter table public.calendar_events
  add column attendance text;

alter table public.calendar_events
  add constraint calendar_events_attendance_valid
    check (attendance is null or attendance in ('attended', 'missed', 'caught_up'));
