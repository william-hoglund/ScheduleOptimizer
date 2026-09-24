"use server";

import { revalidatePath } from "next/cache";

import { fromEpochMinutes } from "@/lib/planner/time-grid";
import { rescheduleMissedSessions } from "@/lib/planner/rescheduling/reschedule-missed-session";
import type { PlannedSession } from "@/lib/planner/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { sessionOutcomeSchema } from "@/lib/validation/session";
import { requireUserContext } from "@/server/auth";
import { nowIso } from "@/server/clock";
import { notify } from "@/server/notification-service";
import { buildPlannerInput } from "@/server/planner-service";
import {
  applyRescheduledSessions,
  cancelSession,
  getSession,
  recordSessionOutcome,
} from "@/server/session-service";

function revalidateSessionViews() {
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/deadlines");
  revalidatePath("/planner");
}

/**
 * Records what happened in a session: done, partly done, or missed.
 *
 * Completing a session also advances its task, which is what stops the planner
 * proposing work that is already finished.
 */
export async function recordOutcome(
  sessionId: string,
  rawOutcome: unknown,
): Promise<ActionResult<{ taskCompleted: boolean }>> {
  const { user } = await requireUserContext();

  const parsed = sessionOutcomeSchema.safeParse(rawOutcome);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(() =>
    recordSessionOutcome(user.id, sessionId, {
      status: parsed.data.status,
      completedMinutes: parsed.data.completedMinutes,
    }),
  );
  if (!result.ok) return result;

  revalidateSessionViews();
  return actionOk({ taskCompleted: result.data.task?.status === "completed" });
}

export async function dismissSession(sessionId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => cancelSession(user.id, sessionId));
  if (!result.ok) return result;

  revalidateSessionViews();
  return actionOk();
}

/** One entry in the "here is exactly what changed" list. */
export type RescheduleChange = {
  kind: "added" | "removed";
  title: string;
  startIso: string;
  endIso: string;
  minutes: number;
};

export type ReschedulePreview = {
  /** Identifies the stored computation, so applying uses the same result. */
  previewId: string;
  changes: RescheduleChange[];
  couldNotPlace: boolean;
  /** How many existing sessions were disturbed. Lower is better. */
  disturbedCount: number;
};

/**
 * Works out where missed work could go — without changing anything yet.
 *
 * The computed plan is stored in `planner_runs` and applied later by id. The
 * alternative, sending the proposed sessions to the browser and back, would
 * mean trusting the client with times; and simply recomputing on apply could
 * give a different answer, because "now" has moved on.
 */
export async function previewReschedule(
  sessionIds: string[],
): Promise<ActionResult<ReschedulePreview>> {
  const { user, timeZone } = await requireUserContext();

  if (sessionIds.length === 0) return { ok: false, error: "invalidInput" };

  return guarded(async () => {
    const now = nowIso();
    const sessions = await Promise.all(sessionIds.map((id) => getSession(user.id, id)));
    const found = sessions.filter((session): session is NonNullable<typeof session> => !!session);

    if (found.length === 0) throw new Error("Those sessions no longer exist.");

    // Plan from today to a fortnight out: far enough to find room, near enough
    // that the work does not drift out of sight.
    const startDate = now.slice(0, 10);
    const endDate = new Date(Date.parse(`${startDate}T00:00:00Z`) + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { input } = await buildPlannerInput({
      userId: user.id,
      timeZone,
      horizon: { startDate, endDate },
      nowIso: now,
      seed: `reschedule:${sessionIds.join(",")}`,
    });

    /**
     * Narrow the engine to *only* the missed work.
     *
     * Without this it would also top up every other outstanding task across the
     * whole horizon — technically a better plan, but not what was asked for.
     * The brief is explicit: do not rebuild the week because one session was
     * missed. So each affected task is presented as needing exactly the minutes
     * that were lost, and nothing else is offered for scheduling.
     */
    const missedMinutesByTask = new Map<string, number>();
    for (const session of found) {
      if (!session.task_id) continue;
      const outstanding = Math.max(0, session.planned_minutes - session.completed_minutes);
      missedMinutesByTask.set(
        session.task_id,
        (missedMinutesByTask.get(session.task_id) ?? 0) + outstanding,
      );
    }

    const narrowed = {
      ...input,
      tasks: input.tasks
        .filter((task) => missedMinutesByTask.has(task.id))
        .map((task) => ({
          ...task,
          estimatedMinutes: missedMinutesByTask.get(task.id) ?? 0,
          completedMinutes: 0,
        })),
    };

    const outcome = rescheduleMissedSessions(narrowed, sessionIds);

    /**
     * Keep the session's own name.
     *
     * The engine names what it places after the *task* ("Statistics exam"),
     * which is right for a fresh plan but wrong here: the diff tells the
     * student "Statistics revision moved to Monday", so that is what must
     * appear on Monday. Anything else is the app saying one thing and doing
     * another.
     */
    const titleByTask = new Map<string, string>();
    for (const session of found) {
      if (session.task_id && !titleByTask.has(session.task_id)) {
        titleByTask.set(session.task_id, session.title);
      }
    }

    const added = outcome.added.map((session) => ({
      ...session,
      title: (session.taskId && titleByTask.get(session.taskId)) || session.title,
    }));

    const changes: RescheduleChange[] = [
      ...found.map((session) => ({
        kind: "removed" as const,
        title: session.title,
        startIso: session.start_at,
        endIso: session.end_at,
        minutes: session.planned_minutes,
      })),
      ...added.map((session) => ({
        kind: "added" as const,
        title: session.title,
        startIso: fromEpochMinutes(session.start),
        endIso: fromEpochMinutes(session.end),
        minutes: session.minutes,
      })),
    ];

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("planner_runs")
      .insert({
        user_id: user.id,
        input_snapshot: JSON.parse(
          JSON.stringify({ kind: "reschedule", sessionIds, horizon: { startDate, endDate } }),
        ),
        result_snapshot: JSON.parse(JSON.stringify({ added })),
        algorithm_version: outcome.result.algorithmVersion,
        seed: input.seed,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Could not prepare the change: ${error?.message}`);

    return {
      previewId: data.id,
      changes,
      couldNotPlace: outcome.couldNotPlace,
      disturbedCount: added.length,
    };
  });
}

/** Applies a previously previewed reschedule, exactly as it was shown. */
export async function applyReschedule(previewId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(async () => {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("planner_runs")
      .select("input_snapshot, result_snapshot")
      .eq("id", previewId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) throw new Error("That change is no longer available. Try again.");

    const input = data.input_snapshot as { kind?: string; sessionIds?: string[] } | null;
    const output = data.result_snapshot as { added?: PlannedSession[] } | null;

    if (input?.kind !== "reschedule" || !input.sessionIds) {
      throw new Error("That change is no longer available. Try again.");
    }

    await applyRescheduledSessions(user.id, {
      removeSessionIds: input.sessionIds,
      add: (output?.added ?? []).map((session) => ({
        taskId: session.taskId,
        courseId: session.courseId,
        title: session.title,
        startIso: fromEpochMinutes(session.start),
        endIso: fromEpochMinutes(session.end),
        minutes: session.minutes,
        reason: session.reason,
      })),
      planId: null,
    });
  });

  if (!result.ok) return result;

  await notify(user.id, {
    type: "session_missed",
    title: "Your plan has been updated",
    body: "The work you missed has been moved to a new time.",
  });

  revalidateSessionViews();
  return actionOk();
}
