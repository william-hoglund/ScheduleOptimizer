"use server";

import { revalidatePath } from "next/cache";

import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { taskProgressSchema, taskSchema } from "@/lib/validation/task";
import { requireUserContext } from "@/server/auth";
import { createTask, deleteTask, setTaskProgress, updateTask } from "@/server/task-service";

function revalidateTaskViews() {
  revalidatePath("/deadlines");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function saveTask(
  input: unknown,
  taskId?: string,
): Promise<ActionResult<{ id: string }>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () =>
    taskId
      ? await updateTask(user.id, taskId, parsed.data, timeZone)
      : await createTask(user.id, parsed.data, timeZone),
  );
  if (!result.ok) return result;

  revalidateTaskViews();
  return actionOk({ id: result.data.id });
}

export async function updateTaskProgress(
  taskId: string,
  input: unknown,
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const parsed = taskProgressSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(() =>
    setTaskProgress(user.id, taskId, {
      status: parsed.data.status,
      completedMinutes: parsed.data.completedMinutes,
    }),
  );
  if (!result.ok) return result;

  revalidateTaskViews();
  return actionOk();
}

export async function removeTask(taskId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => deleteTask(user.id, taskId));
  if (!result.ok) return result;

  revalidateTaskViews();
  return actionOk();
}
