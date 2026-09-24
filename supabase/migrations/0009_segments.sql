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
