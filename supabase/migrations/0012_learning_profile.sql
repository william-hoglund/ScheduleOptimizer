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
