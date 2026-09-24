import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { NotificationRow, NotificationSettingsRow } from "@/lib/supabase/types";

/**
 * In-app notifications.
 *
 * Deliberately quiet. The brief is explicit that too many notifications are
 * worse than none, so nothing is created here that the student did not either
 * ask for or need to decide on. Web push and email are prepared in the schema
 * but off.
 */

export async function listNotifications(
  userId: string,
  { limit = 20 }: { limit?: number } = {},
): Promise<NotificationRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load notifications: ${error.message}`);
  return data ?? [];
}

export async function countUnread(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw new Error(`Could not count notifications: ${error.message}`);
  return count ?? 0;
}

export async function markAllRead(userId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw new Error(`Could not update notifications: ${error.message}`);
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not update the notification: ${error.message}`);
}

export async function getNotificationSettings(
  userId: string,
): Promise<NotificationSettingsRow | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load notification settings: ${error.message}`);
  return data;
}

/**
 * Creates a notification, respecting the student's settings.
 *
 * Returns false when the type is switched off, so callers can stay simple and
 * not each re-implement the check.
 */
export async function notify(
  userId: string,
  notification: {
    type: NotificationRow["type"];
    title: string;
    body?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  },
): Promise<boolean> {
  const settings = await getNotificationSettings(userId);

  // No settings row yet means defaults, which are on for the types that matter.
  if (settings && !isEnabled(settings, notification.type)) return false;
  if (settings && !settings.channel_in_app) return false;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: notification.type,
    title: notification.title,
    body: notification.body ?? null,
    status: "sent",
    sent_at: new Date().toISOString(),
    related_entity_type: notification.relatedEntityType ?? null,
    related_entity_id: notification.relatedEntityId ?? null,
  });

  if (error) {
    // A failed notification must never take down the action that triggered it.
    console.error("[notifications] could not create:", error.message);
    return false;
  }

  return true;
}

function isEnabled(settings: NotificationSettingsRow, type: NotificationRow["type"]): boolean {
  switch (type) {
    case "session_starting":
      return settings.session_starting;
    case "break_time":
      return settings.break_time;
    case "session_ended":
      return settings.session_ended;
    case "deadline_approaching":
      return settings.deadline_approaching;
    case "weekly_plan_incomplete":
      return settings.weekly_plan_incomplete;
    case "session_missed":
      return settings.session_missed;
    case "plan_ready":
      return true;
    default:
      return true;
  }
}
