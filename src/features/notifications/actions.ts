"use server";

import { revalidatePath } from "next/cache";

import { actionOk, guarded, type ActionResult } from "@/lib/validation/action-result";
import { requireUserContext } from "@/server/auth";
import { markAllRead, markRead } from "@/server/notification-service";

export async function markAllNotificationsRead(): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => markAllRead(user.id));
  if (!result.ok) return result;

  revalidatePath("/", "layout");
  return actionOk();
}

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => markRead(user.id, notificationId));
  if (!result.ok) return result;

  revalidatePath("/", "layout");
  return actionOk();
}
