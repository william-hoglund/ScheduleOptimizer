import "server-only";

import { wallClockToUtc } from "@/lib/calendar/time";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TaskRow } from "@/lib/supabase/types";
import { ERRAND_TYPES, resolveMinutes } from "@/lib/tasks/task-kinds";
import type { TodoInput } from "@/lib/validation/todo";

/**
 * The weekly to-do list.
 *
 * These are rows in `tasks` like everything else — that is the point. An
 * application due Friday and a revision session compete for the same evening,
 * so they have to be the same kind of thing to the planner. Only the listing
 * differs: this service reads the errand types, Deadlines reads the coursework.
 */

function emptyToNull(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

function toRow(input: TodoInput, timeZone: string) {
  const deadlineLocal = emptyToNull(input.deadlineLocal);
  const fixedLocal = emptyToNull(input.fixedStartLocal);

  return {
    title: input.title,
    task_type: input.todoType,
    deadline: deadlineLocal ? wallClockToUtc(deadlineLocal, timeZone) : null,
    fixed_start_at: fixedLocal ? wallClockToUtc(fixedLocal, timeZone) : null,
    // Stored resolved rather than as null, so the number the planner used is
    // the number the student can see and correct.
    estimated_minutes: resolveMinutes(input.todoType, input.estimatedMinutes),
    // A to-do is nobody's coursework.
    course_id: null,
  };
}

export async function listTodos(userId: string): Promise<TaskRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .in("task_type", [...ERRAND_TYPES])
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load your to-do list: ${error.message}`);
  return data ?? [];
}

export async function createTodo(
  userId: string,
  input: TodoInput,
  timeZone: string,
): Promise<TaskRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({ user_id: userId, status: "not_started", ...toRow(input, timeZone) })
    .select("*")
    .single();

  if (error) throw new Error(`Could not add that to-do: ${error.message}`);
  return data;
}

export async function updateTodo(
  userId: string,
  todoId: string,
  input: TodoInput,
  timeZone: string,
): Promise<TaskRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("tasks")
    .update(toRow(input, timeZone))
    .eq("id", todoId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update that to-do: ${error.message}`);
  return data;
}

/**
 * Ticking one off.
 *
 * `completed_minutes` is brought up to the estimate so the time shows in
 * Insights as time actually spent — a dentist appointment that took an hour
 * took an hour, whether or not anyone timed it.
 */
export async function setTodoDone(
  userId: string,
  todoId: string,
  done: boolean,
): Promise<TaskRow> {
  const supabase = await createServerSupabaseClient();

  const { data: current, error: readError } = await supabase
    .from("tasks")
    .select("estimated_minutes")
    .eq("id", todoId)
    .eq("user_id", userId)
    .single();

  if (readError) throw new Error(`Could not find that to-do: ${readError.message}`);

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: done ? "completed" : "not_started",
      completed_minutes: done ? current.estimated_minutes : 0,
    })
    .eq("id", todoId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update that to-do: ${error.message}`);
  return data;
}

export async function deleteTodo(userId: string, todoId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("tasks").delete().eq("id", todoId).eq("user_id", userId);

  if (error) throw new Error(`Could not remove that to-do: ${error.message}`);
}
