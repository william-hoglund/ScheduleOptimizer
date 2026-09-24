-- 0006_study_groups.sql
-- Private, invite-only study groups ranked on plan adherence.
--
-- Design rationale is in docs/PLAN.md §5b. The short version: members are
-- ranked on how much of their *own* plan they kept, never on hours studied and
-- never on grades — so a lighter week costs nothing, and the ranking cannot be
-- won by sleep deprivation.

-- ----------------------------------------------------------- study groups ---

create table public.study_groups (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  description       text,
  -- Short, human-typeable, and unique. This is the only way in: there is no
  -- public directory and no global ranking.
  join_code         text not null unique,
  -- Sessions the group aims to complete together in a week.
  weekly_session_goal smallint not null default 20,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint study_groups_name_not_blank check (length(trim(name)) > 0),
  constraint study_groups_join_code_shape check (join_code ~ '^[A-Z0-9]{6,10}$'),
  constraint study_groups_goal_range check (weekly_session_goal between 1 and 500)
);

create trigger study_groups_set_updated_at
  before update on public.study_groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- members ---

create table public.study_group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.study_groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member',
  -- What this member lets the group see. Adherence only by default: the group
  -- never learns what someone is studying unless they opt in.
  share_level  text not null default 'adherence',
  display_name text,
  -- Paused members stay in the group but drop off the board, so a hard week
  -- does not force a public exit.
  status       text not null default 'active',
  joined_at    timestamptz not null default now(),

  constraint study_group_members_role_valid check (role in ('owner', 'member')),
  constraint study_group_members_share_valid check (share_level in ('adherence', 'hours', 'courses')),
  constraint study_group_members_status_valid check (status in ('active', 'paused')),
  unique (group_id, user_id)
);

create index study_group_members_user_idx on public.study_group_members (user_id);
create index study_group_members_group_idx on public.study_group_members (group_id);

-- ----------------------------------------------------------------- scores ---

-- Computed server-side from study_sessions. The client never writes here —
-- otherwise the leaderboard would be trivially forged.
create table public.study_group_scores (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.study_groups(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  planned_minutes    integer not null default 0,
  completed_minutes  integer not null default 0,
  -- 0–100. The ranking metric.
  adherence_percent  smallint not null default 0,
  sessions_completed integer not null default 0,
  current_streak_days smallint not null default 0,
  computed_at        timestamptz not null default now(),

  constraint study_group_scores_period_ordered check (period_end >= period_start),
  constraint study_group_scores_adherence_range check (adherence_percent between 0 and 100),
  unique (group_id, user_id, period_start)
);

create index study_group_scores_board_idx
  on public.study_group_scores (group_id, period_start, adherence_percent desc);

-- ------------------------------------------------------------ membership ---

/*
 * Membership lookup that bypasses RLS.
 *
 * This exists to break a recursion. The natural policy on study_group_members
 * is "you may see rows for groups you belong to" — but evaluating that requires
 * querying study_group_members, which re-triggers the same policy, and Postgres
 * fails with infinite recursion.
 *
 * security definer runs the lookup as the function owner, so RLS is not applied
 * inside it and the cycle is broken. set search_path = '' forces fully-qualified
 * names, closing the usual privilege-escalation route.
 */
create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.study_group_members
    where group_id = target_group
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

-- ------------------------------------------------------------------- RLS ---

alter table public.study_groups        enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_scores  enable row level security;

-- Groups are visible to their members, and editable only by their owner.
create policy "study_groups_read_as_member" on public.study_groups
  for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));

create policy "study_groups_insert_own" on public.study_groups
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "study_groups_update_owner" on public.study_groups
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "study_groups_delete_owner" on public.study_groups
  for delete to authenticated
  using (owner_id = auth.uid());

-- Members can see who else is in their groups.
create policy "study_group_members_read" on public.study_group_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));

-- Joining is inserting your own row. The group is found by its code, which the
-- server resolves before this runs.
create policy "study_group_members_join" on public.study_group_members
  for insert to authenticated
  with check (user_id = auth.uid());

-- You may change your own membership (pause, share level, display name) and
-- leave. Nobody can alter anyone else's.
create policy "study_group_members_update_own" on public.study_group_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "study_group_members_leave" on public.study_group_members
  for delete to authenticated
  using (user_id = auth.uid());

-- Scores are readable by the group and writable by nobody. There is
-- deliberately no insert or update policy: the only way a row gets here is
-- through refresh_my_group_scores() below, which computes the numbers itself.
create policy "study_group_scores_read" on public.study_group_scores
  for select to authenticated
  using (public.is_group_member(group_id));

-- ------------------------------------------------------- joining by code ---

/*
 * Resolves an invite code to a group id.
 *
 * Needed because study_groups is only readable by its members — so someone
 * holding a valid code could not look the group up in order to join it.
 *
 * Returns the id and nothing else. A wrong code returns null, which is
 * indistinguishable from a code for a group that exists, so this cannot be used
 * to probe for groups.
 */
create or replace function public.resolve_join_code(code text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id from public.study_groups where join_code = upper(trim(code));
$$;

revoke all on function public.resolve_join_code(text) from public;
grant execute on function public.resolve_join_code(text) to authenticated;

-- ------------------------------------------------------ score computation ---

/*
 * Recomputes the caller's own score for the current week, in every group they
 * belong to.
 *
 * The numbers are derived here, from the caller's own study_sessions — they are
 * never passed in. That is the whole point: a leaderboard whose scores the
 * client could supply is one anyone could forge, and adherence is the only
 * thing this product ranks on.
 *
 * security definer is what lets it write to study_group_scores, which has no
 * insert policy at all. auth.uid() still scopes every read and write to the
 * caller, so it cannot touch anyone else's score.
 */
create or replace function public.refresh_my_group_scores()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  period_start_date date;
  period_end_date date;
  planned integer;
  completed integer;
  finished integer;
  adherence smallint;
begin
  if caller is null then
    return;
  end if;

  -- ISO week: Monday to Sunday, in UTC. Close enough for a weekly board, and
  -- consistent for everyone in a group regardless of their own time zone.
  period_start_date := (date_trunc('week', now() at time zone 'utc'))::date;
  period_end_date := period_start_date + 6;

  select
    coalesce(sum(planned_minutes), 0),
    coalesce(sum(completed_minutes), 0),
    count(*) filter (where status = 'completed')
  into planned, completed, finished
  from public.study_sessions
  where user_id = caller
    and status <> 'cancelled'
    and start_at >= period_start_date::timestamptz
    and start_at < (period_end_date + 1)::timestamptz
    and start_at <= now();

  -- Nothing planned yet means 100%, not 0%: a student who has not been asked to
  -- do anything has not failed to do it.
  adherence := case
    when planned > 0 then least(100, round((completed::numeric / planned) * 100))::smallint
    else 100
  end;

  insert into public.study_group_scores (
    group_id, user_id, period_start, period_end,
    planned_minutes, completed_minutes, adherence_percent, sessions_completed, computed_at
  )
  select
    m.group_id, caller, period_start_date, period_end_date,
    planned, completed, adherence, finished, now()
  from public.study_group_members m
  where m.user_id = caller
  on conflict (group_id, user_id, period_start) do update set
    planned_minutes = excluded.planned_minutes,
    completed_minutes = excluded.completed_minutes,
    adherence_percent = excluded.adherence_percent,
    sessions_completed = excluded.sessions_completed,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function public.refresh_my_group_scores() from public;
grant execute on function public.refresh_my_group_scores() to authenticated;
