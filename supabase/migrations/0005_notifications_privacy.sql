-- 0005_notifications_privacy.sql
-- Notifications, per-type notification settings, GDPR consent and audit trail.

-- ----------------------------------------------------------- notifications ---

create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null,
  title               text not null,
  body                text,
  scheduled_for       timestamptz not null default now(),
  sent_at             timestamptz,
  read_at             timestamptz,
  status              text not null default 'pending',
  related_entity_type text,
  related_entity_id   uuid,
  created_at          timestamptz not null default now(),

  constraint notifications_type_valid check (type in (
    'session_starting', 'break_time', 'session_ended', 'deadline_approaching',
    'weekly_plan_incomplete', 'session_missed', 'plan_ready'
  )),
  constraint notifications_status_valid check (status in ('pending', 'sent', 'dismissed', 'failed')),
  constraint notifications_entity_type_valid check (
    related_entity_type is null
    or related_entity_type in ('task', 'course', 'study_session', 'study_plan', 'calendar_event')
  )
);

-- The dispatch job's only query: what is due and still unsent.
create index notifications_dispatch_idx on public.notifications (status, scheduled_for)
  where status = 'pending';
-- The bell's unread count.
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;

-- ------------------------------------------------- notification settings ---

-- Separate from study_preferences so muting reminders never touches planning data.
create table public.notification_settings (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users(id) on delete cascade,
  session_starting       boolean not null default true,
  session_starting_lead  smallint not null default 10,
  break_time             boolean not null default true,
  session_ended          boolean not null default false,
  deadline_approaching   boolean not null default true,
  deadline_lead_days     smallint not null default 3,
  weekly_plan_incomplete boolean not null default true,
  session_missed         boolean not null default true,
  -- Channels. In-app is the MVP; the others are prepared but off.
  channel_in_app         boolean not null default true,
  channel_email          boolean not null default false,
  channel_push           boolean not null default false,
  -- No notifications inside this window, whatever else is enabled.
  quiet_hours_start      time,
  quiet_hours_end        time,
  updated_at             timestamptz not null default now(),

  constraint notification_settings_lead_range check (session_starting_lead between 0 and 120),
  constraint notification_settings_deadline_lead_range check (deadline_lead_days between 0 and 30)
);

create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------- user consents ---

-- GDPR: answers "what did I agree to, and when", including withdrawal.
create table public.user_consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  granted      boolean not null,
  granted_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),

  constraint user_consents_type_valid check (consent_type in ('analytics', 'product_improvement', 'ai_processing')),
  unique (user_id, consent_type)
);

-- ------------------------------------------------------------- audit log ---

-- Sensitive changes only: integrations connected or revoked, exports taken,
-- account deletion. Not a general activity feed.
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_user_idx on public.audit_log (user_id, created_at desc);

-- ------------------------------------------------------------------- RLS ---

alter table public.notifications          enable row level security;
alter table public.notification_settings  enable row level security;
alter table public.user_consents          enable row level security;
alter table public.audit_log              enable row level security;

create policy "notifications_own_rows" on public.notifications
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "notification_settings_own_rows" on public.notification_settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_consents_own_rows" on public.user_consents
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Read-only from the client: an audit trail the subject can rewrite is not an
-- audit trail. Writes happen server-side with the service-role key.
create policy "audit_log_read_own" on public.audit_log
  for select to authenticated using (auth.uid() = user_id);
