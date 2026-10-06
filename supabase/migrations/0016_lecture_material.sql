-- 0016_lecture_material.sql
-- Course documents were only ever things to *extract facts from* (syllabus,
-- schedule, assessment guide). Lecture slides and notes are different: they
-- are the material the student studies, read by the Learn page on demand
-- rather than mined once for dates and weights. Two new document types; the
-- check constraint is dropped and recreated with them, the standard way to
-- widen a Postgres check (same as 0013).

alter table public.course_documents
  drop constraint course_documents_type_valid;

alter table public.course_documents
  add constraint course_documents_type_valid check (
    document_type in (
      'syllabus', 'schedule', 'assessment_guide', 'reading_list', 'other',
      'lecture_slides', 'lecture_notes'
    )
  );
