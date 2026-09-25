-- 0010_account_deletion.sql
-- Deleting your own account, without a service-role key in the app.
--
-- Every table in this schema already carries
-- `user_id uuid not null references auth.users(id) on delete cascade` (or, for
-- profiles, `id references auth.users(id) on delete cascade`) — see 0001-0009.
-- That means one delete against `auth.users` is enough to remove every row
-- this account owns, everywhere, in one transaction. Nothing else needs to
-- change when a new table is added later, as long as it follows the same
-- convention every table here already does.
--
-- security definer is what makes this possible: the function runs with the
-- privileges of whoever created it (the project owner, via the SQL Editor),
-- not the caller's own `authenticated` role, which normally cannot touch
-- `auth.users` at all. auth.uid() still scopes the delete to the caller's own
-- row — there is no argument that names a different user, so there is no way
-- to call this on anyone else's account. set search_path = '' forces every
-- name to be schema-qualified, closing the usual privilege-escalation route
-- through a function that trusts an unqualified name. Same shape as
-- `refresh_my_group_scores()` in 0006_study_groups.sql.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
