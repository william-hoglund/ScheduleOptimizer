import "server-only";

import { utcToWallClock } from "@/lib/calendar/time";
import { isWithinQuietHours } from "@/lib/notifications/quiet-hours";
import { selectDueDeadlineReminders } from "@/lib/notifications/due-deadline-reminders";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { notify } from "./notification-service";

/**
 * The notification dispatch job — meant to be invoked by a scheduler
 * (`vercel.json`'s `crons`, via `/api/notifications/dispatch`), never by a
 * signed-in browser. There is no request, no cookies, no session here, which
 * is why this is the one place in the app that talks to Supabase entirely
 * through the admin client rather than any `*-service.ts` function that
 * assumes a per-request RLS-scoped one — see docs/PLAN.md Session 24 for why
 * that distinction mattered enough to reshape this session's scope.
 *
 * Deliberately handles exactly one notification type
 * (`deadline_approaching`) — see the deferred-work table in the same
 * session's writeup for the others and why each is out of scope here.
 */

const DEFAULT_DEADLINE_APPROACHING = true;
const DEFAULT_LEAD_DAYS = 3;

export async function dispatchNotifications(
  nowIso: string,
): Promise<{ checked: number; sent: number }> {
  const supabase = createAdminSupabaseClient();

  const [profilesResult, settingsResult, tasksResult, notifiedResult] = await Promise.all([
    supabase.from("profiles").select("id, timezone"),
    supabase
      .from("notification_settings")
      .select("user_id, deadline_approaching, deadline_lead_days, quiet_hours_start, quiet_hours_end"),
    supabase
      .from("tasks")
      .select("id, user_id, title, deadline")
      .not("deadline", "is", null)
      .not("status", "in", "(completed,cancelled)"),
    supabase
      .from("notifications")
      .select("user_id, related_entity_id")
      .eq("type", "deadline_approaching")
      .eq("related_entity_type", "task"),
  ]);

  const firstError =
    profilesResult.error ?? settingsResult.error ?? tasksResult.error ?? notifiedResult.error;
  if (firstError) throw new Error(`Could not load data for dispatch: ${firstError.message}`);

  const settingsByUserId = new Map((settingsResult.data ?? []).map((row) => [row.user_id, row]));

  const tasksByUserId = new Map<string, Array<{ id: string; title: string; deadline: string }>>();
  for (const task of tasksResult.data ?? []) {
    if (!task.deadline) continue;
    const list = tasksByUserId.get(task.user_id) ?? [];
    list.push({ id: task.id, title: task.title, deadline: task.deadline });
    tasksByUserId.set(task.user_id, list);
  }

  const notifiedTaskIdsByUserId = new Map<string, Set<string>>();
  for (const row of notifiedResult.data ?? []) {
    if (!row.related_entity_id) continue;
    const set = notifiedTaskIdsByUserId.get(row.user_id) ?? new Set<string>();
    set.add(row.related_entity_id);
    notifiedTaskIdsByUserId.set(row.user_id, set);
  }

  let checked = 0;
  let sent = 0;

  for (const profile of profilesResult.data ?? []) {
    const settings = settingsByUserId.get(profile.id) ?? null;
    const deadlineApproachingEnabled = settings?.deadline_approaching ?? DEFAULT_DEADLINE_APPROACHING;
    if (!deadlineApproachingEnabled) continue;

    const nowLocalTime = utcToWallClock(nowIso, profile.timezone).slice(11, 16);
    if (
      isWithinQuietHours({
        nowLocalTime,
        quietStart: settings?.quiet_hours_start ?? null,
        quietEnd: settings?.quiet_hours_end ?? null,
      })
    ) {
      continue;
    }

    const tasks = tasksByUserId.get(profile.id) ?? [];
    checked += tasks.length;

    const dueTaskIds = selectDueDeadlineReminders({
      tasks: tasks.map((task) => ({ id: task.id, deadlineIso: task.deadline })),
      alreadyNotifiedTaskIds: notifiedTaskIdsByUserId.get(profile.id) ?? new Set(),
      leadDays: settings?.deadline_lead_days ?? DEFAULT_LEAD_DAYS,
      nowIso,
    });

    for (const taskId of dueTaskIds) {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) continue;

      const ok = await notify(
        profile.id,
        {
          type: "deadline_approaching",
          title: task.title,
          body: `Due ${utcToWallClock(task.deadline, profile.timezone).slice(0, 10)}`,
          relatedEntityType: "task",
          relatedEntityId: task.id,
        },
        supabase,
      );
      if (ok) sent += 1;
    }
  }

  return { checked, sent };
}
