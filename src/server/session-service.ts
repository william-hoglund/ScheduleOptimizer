import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SessionStatus, StudySessionRow, TaskRow } from "@/lib/supabase/types";

/**
 * Study sessions after they have been approved — what actually happened.
 *
 * The important rule here: **completing a session advances its task.** Without
 * that the planner would keep proposing work the student has already done,
 * because `remaining_minutes` would never fall.
 */

export async function listSessionsBetween(
  userId: string,
  startIso: string,
  endIso: string,
): Promise<StudySessionRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("user_id", userId)
    .lt("start_at", endIso)
    .gt("end_at", startIso)
    .order("start_at", { ascending: true });

  if (error) throw new Error(`Could not load sessions: ${error.message}`);
  return data ?? [];
}

/**
 * Sessions whose time has passed but which are still marked as planned.
 *
 * Not written to the database as "missed" automatically — a student who
 * studied without pressing a button should not be told they failed. The UI
 * offers this as a question, and only their answer is recorded.
 */
export async function findUnresolvedSessions(
  userId: string,
  nowIso: string,
): Promise<StudySessionRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "planned")
    .lt("end_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(`Could not load past sessions: ${error.message}`);
  return data ?? [];
}

export async function getSession(
  userId: string,
  sessionId: string,
): Promise<StudySessionRow | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load session: ${error.message}`);
  return data;
}

/**
 * Records what happened in a session, and moves its task forward by the same
 * amount.
 *
 * Both writes are needed for the loop to close. They are not in a transaction —
 * Supabase's REST API has no client-side transactions — so the session is
 * written first: if the second write fails, the student's record of what they
 * did survives, and the task can be corrected by hand. Losing the session and
 * keeping the progress would be the worse failure.
 */
export async function recordSessionOutcome(
  userId: string,
  sessionId: string,
  outcome: { status: SessionStatus; completedMinutes: number },
): Promise<{ session: StudySessionRow; task: TaskRow | null }> {
  const supabase = await createServerSupabaseClient();

  const existing = await getSession(userId, sessionId);
  if (!existing) throw new Error("That session no longer exists.");

  // Only the difference is applied, so pressing "done" twice, or correcting a
  // partial afterwards, cannot double-count.
  const delta = outcome.completedMinutes - existing.completed_minutes;

  const { data: session, error } = await supabase
    .from("study_sessions")
    .update({ status: outcome.status, completed_minutes: outcome.completedMinutes })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not record the session: ${error.message}`);

  if (!existing.task_id || delta === 0) return { session, task: null };

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", existing.task_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (taskError || !task) return { session, task: null };

  const nextCompleted = Math.max(
    0,
    Math.min(task.estimated_minutes, task.completed_minutes + delta),
  );

  // Finishing the last of the work closes the task; anything else means it is
  // under way.
  const nextStatus =
    nextCompleted >= task.estimated_minutes && task.estimated_minutes > 0
      ? "completed"
      : nextCompleted > 0
        ? "in_progress"
        : task.status;

  const { data: updatedTask, error: updateError } = await supabase
    .from("tasks")
    .update({ completed_minutes: nextCompleted, status: nextStatus })
    .eq("id", task.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError) {
    console.error("[sessions] session recorded but task not advanced:", updateError.message);
    return { session, task: null };
  }

  return { session, task: updatedTask };
}

/** Drops a session the student decided is no longer relevant. */
export async function cancelSession(userId: string, sessionId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("study_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not cancel the session: ${error.message}`);
}

/** Replaces the sessions a reschedule moved, in one write per session. */
export async function applyRescheduledSessions(
  userId: string,
  {
    removeSessionIds,
    add,
    planId,
  }: {
    removeSessionIds: string[];
    add: Array<{
      taskId: string | null;
      courseId: string | null;
      title: string;
      startIso: string;
      endIso: string;
      minutes: number;
      reason: unknown;
    }>;
    planId: string | null;
  },
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  if (removeSessionIds.length > 0) {
    const { error } = await supabase
      .from("study_sessions")
      .delete()
      .eq("user_id", userId)
      .in("id", removeSessionIds);

    if (error) throw new Error(`Could not remove the old sessions: ${error.message}`);
  }

  if (add.length > 0) {
    const { error } = await supabase.from("study_sessions").insert(
      add.map((session) => ({
        user_id: userId,
        study_plan_id: planId,
        task_id: session.taskId,
        course_id: session.courseId,
        title: session.title,
        start_at: session.startIso,
        end_at: session.endIso,
        planned_minutes: session.minutes,
        status: "planned" as const,
        generation_reason: JSON.stringify(session.reason),
      })),
    );

    if (error) throw new Error(`Could not add the rescheduled sessions: ${error.message}`);
  }
}
