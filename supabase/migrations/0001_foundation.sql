-- 0001_foundation.sql
-- Shared helpers and the profiles table.
--
-- Row Level Security convention used throughout this project:
--   every table carries user_id, and a single "for all" policy restricts every
--   operation to auth.uid() = user_id. One policy per table rather than four
--   makes it possible to audit at a glance that nothing was missed.

-- ---------------------------------------------------------------- helpers ---

-- Keeps updated_at honest. Attached to every table that has the column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles ---

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text,
  timezone             text not null default 'Europe/Stockholm',
  locale               text not null default 'en',
  onboarding_completed boolean not null default false,
  -- Which onboarding step the student reached, so a half-finished signup can be
  -- resumed instead of restarted (brief §11: "Save each onboarding step").
  onboarding_step      smallint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint profiles_locale_valid check (locale in ('en', 'sv')),
  constraint profiles_onboarding_step_range check (onboarding_step between 0 and 6)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- profiles keys on id (it IS the auth user), not user_id.
create policy "profiles_own_row" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------- profile auto-creation ---

-- Creates the profile row the moment a user registers, so the app never has to
-- cope with a signed-in user who has no profile.
--
-- security definer: runs as the function owner so it can write to public.profiles
-- regardless of the caller's permissions.
-- set search_path = '': forces fully-qualified names, closing a known
-- privilege-escalation route where a caller shadows a table name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, timezone, locale)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Europe/Stockholm'),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
