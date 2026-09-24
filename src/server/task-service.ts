import "server-only";

import { wallClockToUtc } from "@/lib/calendar/time";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TaskRow } from "@/lib/supabase/types";
import type { TaskInput } from "@/lib/validation/task";

/** Tasks. The only place the `tasks` table is read or written. */

function emptyToNull(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

function toRow(input: TaskInput, timeZone: string) {
  const deadlineLocal = emptyToNull(input.deadlineLocal);

  return {
    title: input.title,
    course_id: emptyToNull(input.courseId),
    parent_task_id: emptyToNull(input.parentTaskId),
    description: emptyToNull(input.description),
    task_type: input.taskType,
    status: input.status,
    priority: input.priority,
    difficulty: input.difficulty,
    // The one conversion from wall-clock to instant, done server-side where the
    // student's timezone is known.
    deadline: deadlineLocal ? wallClockToUtc(deadlineLocal, timeZone) : null,
    estimated_minutes: input.estimatedMinutes,
    completed_minutes: input.completedMinutes,
    preferred_study_method: emptyToNull(input.preferredStudyMethod) as
      TaskRow["preferred_study_method"] | null,
  };
}

export async function listTasks(
  userId: string,
  { includeCompleted = true }: { includeCompleted?: boolean } = {},
): Promise<TaskRow[]> {
  const supabase = await createServerSupabaseClient();

  let query = supabase.from("tasks").select("*").eq("user_id", userId);
  if (!includeCompleted) query = query.not("status", "in", "(completed,cancelled)");

  // Undated work sorts last: nullsFirst false puts "no deadline" after
  // everything that actually has one.
  const { data, error } = await query
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false });

  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return data ?? [];
}

export async function createTask(
  userId: string,
  input: TaskInput,
  timeZone: string,
): Promise<TaskRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({ user_id: userId, ...toRow(input, timeZone) })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save task: ${error.message}`);
  return data;
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: TaskInput,
  timeZone: string,
): Promise<TaskRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("tasks")
    .update(toRow(input, timeZone))
    .eq("id", taskId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update task: ${error.message}`);
  return data;
}

/** Quick progress update from a list row. */
export async function setTaskProgress(
  userId: string,
  taskId: string,
  changes: { status: TaskRow["status"]; completedMinutes: number },
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("tasks")
    .update({ status: changes.status, completed_minutes: changes.completedMinutes })
    .eq("id", taskId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not update task: ${error.message}`);
}

/** Cascades to subtasks, which the database enforces via parent_task_id. */
export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", userId);

  if (error) throw new Error(`Could not delete task: ${error.message}`);
}
