"use server";

import { revalidatePath } from "next/cache";

import {
  actionOk,
  fromZodError,
  guarded,
  type ActionResult,
} from "@/lib/validation/action-result";
import { todoSchema } from "@/lib/validation/todo";
import { requireUserContext } from "@/server/auth";
import { createTodo, deleteTodo, setTodoDone, updateTodo } from "@/server/todo-service";

/**
 * The weekly to-do list.
 *
 * Every write revalidates the planner as well as this page: a to-do takes
 * hours out of the same week as revision, so the plan on screen is stale the
 * moment one is added.
 */

function revalidateAffected() {
  revalidatePath("/todos");
  revalidatePath("/dashboard");
  revalidatePath("/planner");
  revalidatePath("/calendar");
}

export async function saveTodo(
  todoId: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = todoSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () =>
    todoId
      ? await updateTodo(user.id, todoId, parsed.data, timeZone)
      : await createTodo(user.id, parsed.data, timeZone),
  );
  if (!result.ok) return result;

  revalidateAffected();
  return actionOk({ id: result.data.id });
}

export async function toggleTodoDone(
  todoId: string,
  done: boolean,
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => setTodoDone(user.id, todoId, done));
  if (!result.ok) return result;

  revalidateAffected();
  return actionOk();
}

export async function removeTodo(todoId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => deleteTodo(user.id, todoId));
  if (!result.ok) return result;

  revalidateAffected();
  return actionOk();
}
