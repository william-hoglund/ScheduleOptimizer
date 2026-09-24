import "server-only";

import { toEpochMinutes, fromEpochMinutes } from "@/lib/planner/time-grid";
import type {
  ExistingSession,
  PlannerAvailabilityRule,
  PlannerCalendarSource,
  PlannerFixedEvent,
  PlannerInput,
  PlannerPreferences,
  PlannerResult,
  PlannerTask,
} from "@/lib/planner/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fixedTodoWindow } from "@/lib/tasks/task-kinds";
import type { CourseRow, StudyPlanRow, StudySessionRow } from "@/lib/supabase/types";
import { defaultStudyPreferences } from "@/lib/validation/preferences";
import { getStudyPreferences, toPreferencesInput } from "./preference-service";

/**
 * The bridge between the database and the scheduling engine.
 *
 * The engine is deliberately pure — it knows nothing about Supabase. This is
 * the only place that translates stored rows into a `PlannerInput` and writes a
 * `PlannerResult` back. Keeping the mapping here is what lets the engine stay
 * testable without a database.
 */

export type PlanHorizon = {
  /** Local calendar dates, inclusive. */
  startDate: string;
  endDate: string;
};

/**
 * Assembles everything the engine needs for one run.
 *
 * `now` and `seed` come from the caller rather than being read here, so a run
 * can be replayed exactly from a `planner_runs` snapshot.
 */
export async function buildPlannerInput({
  userId,
  timeZone,
  horizon,
  nowIso,
  seed,
  courseFilter,
}: {
  userId: string;
  timeZone: string;
  horizon: PlanHorizon;
  nowIso: string;
  seed: string;
  /** When set, only these courses are planned for. */
  courseFilter?: string[];
}): Promise<{ input: PlannerInput; courses: CourseRow[] }> {
  const supabase = await createServerSupabaseClient();

  // The engine needs a little slack around the horizon: a fixed event starting
  // the evening before still blocks the first morning.
  const rangeStart = `${horizon.startDate}T00:00:00.000Z`;
  const rangeEnd = `${horizon.endDate}T23:59:59.999Z`;

  const [
    preferencesRow,
    rulesResult,
    coursesResult,
    tasksResult,
    eventsResult,
    sourcesResult,
    sessionsResult,
  ] = await Promise.all([
      getStudyPreferences(userId),
      supabase.from("availability_rules").select("*").eq("user_id", userId),
      supabase.from("courses").select("*").eq("user_id", userId).eq("archived", false),
      supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .not("status", "in", "(completed,cancelled)"),
      supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", userId)
        .lt("start_at", rangeEnd)
        .gt("end_at", rangeStart),
      supabase.from("calendar_sources").select("*").eq("user_id", userId),
      supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", userId)
        .lt("start_at", rangeEnd)
        .gt("end_at", rangeStart),
    ]);

  const firstError =
    rulesResult.error ??
    coursesResult.error ??
    tasksResult.error ??
    eventsResult.error ??
    sessionsResult.error;
  if (firstError) {
    throw new Error(`Could not load planning data: ${firstError.message}`);
  }

  const courses = coursesResult.data ?? [];
  const courseById = new Map(courses.map((course) => [course.id, course]));

  const preferences = toPlannerPreferences(
    preferencesRow ? toPreferencesInput(preferencesRow) : defaultStudyPreferences,
  );

  const allowed = courseFilter && courseFilter.length > 0 ? new Set(courseFilter) : null;

  const tasks: PlannerTask[] = (tasksResult.data ?? [])
    // A to-do with a time of its own is already in `fixedTodos` as an obstacle.
    // Leaving it here too would have the planner schedule time to do a thing it
    // has just blocked out time for.
    .filter((task) => task.fixed_start_at === null)
    .filter((task) => {
      if (!allowed) return true;
      // Work with no course still counts as the student's own.
      return task.course_id === null || allowed.has(task.course_id);
    })
    .map((task) => ({
      id: task.id,
      courseId: task.course_id,
      title: task.title,
      taskType: task.task_type,
      deadline: task.deadline ? toEpochMinutes(task.deadline) : null,
      estimatedMinutes: task.estimated_minutes,
      completedMinutes: task.completed_minutes,
      priority: task.priority,
      difficulty: task.difficulty,
      preferredStudyMethod: task.preferred_study_method,
      // A task inherits its course's weight, so "prioritise databases this week"
      // lifts everything in that course at once.
      coursePriority: task.course_id ? (courseById.get(task.course_id)?.priority ?? 3) : 3,
      dependsOn: [],
    }));

  /**
   * To-dos with a time of their own.
   *
   * The dentist at 14:00 is not work the planner may place; it is work it must
   * plan around. They leave the task list and join the obstacles, so study time
   * is never proposed on top of them.
   */
  const fixedTodos = (tasksResult.data ?? []).flatMap((task) => {
    const window = fixedTodoWindow({
      taskType: task.task_type,
      fixedStartAt: task.fixed_start_at,
      estimatedMinutes: task.estimated_minutes,
    });
    if (!window) return [];

    return [
      {
        id: `todo-${task.id}`,
        start: toEpochMinutes(window.startIso),
        end: toEpochMinutes(window.endIso),
        isFixed: true,
        courseId: task.course_id,
        sourceId: null,
      } satisfies PlannerFixedEvent,
    ];
  });

  const fixedEvents: PlannerFixedEvent[] = (eventsResult.data ?? []).map((event) => ({
    id: event.id,
    start: toEpochMinutes(event.start_at),
    end: toEpochMinutes(event.end_at),
    isFixed: event.is_fixed,
    courseId: event.course_id,
    sourceId: event.source_id,
  })).concat(fixedTodos);

  /**
   * Day rules from imported calendars — the reason a full day at the office
   * leaves no study on that evening.
   *
   * Missing or unreadable sources must not take the planner down with them: an
   * empty list simply means every day behaves the way it always did.
   */
  const calendarSources: PlannerCalendarSource[] = (sourcesResult.data ?? [])
    .filter((source) => source.day_effect !== "none")
    .map((source) => ({
      id: source.id,
      dayEffect: source.day_effect,
      thresholdMinutes: source.day_effect_threshold_minutes,
      reducedDailyMinutes: source.reduced_daily_minutes,
    }));

  const availabilityRules: PlannerAvailabilityRule[] = (rulesResult.data ?? []).map((rule) => ({
    dayOfWeek: rule.day_of_week,
    startTime: rule.start_time.slice(0, 5),
    endTime: rule.end_time.slice(0, 5),
    ruleType: rule.rule_type,
  }));

  const existingSessions: ExistingSession[] = (sessionsResult.data ?? []).map((session) => ({
    id: session.id,
    taskId: session.task_id,
    courseId: session.course_id,
    start: toEpochMinutes(session.start_at),
    end: toEpochMinutes(session.end_at),
    status: session.status,
    isLocked: session.is_locked,
    manuallyModified: session.manually_modified,
    completedMinutes: session.completed_minutes,
  }));

  return {
    courses,
    input: {
      now: toEpochMinutes(nowIso),
      seed,
      timeZone,
      horizonStartDate: horizon.startDate,
      horizonEndDate: horizon.endDate,
      preferences,
      availabilityRules,
      fixedEvents,
      calendarSources,
      tasks,
      existingSessions,
    },
  };
}

function toPlannerPreferences(input: ReturnType<typeof toPreferencesInput>): PlannerPreferences {
  return {
    minimumSessionMinutes: input.minimumSessionMinutes,
    preferredSessionMinutes: input.preferredSessionMinutes,
    maximumSessionMinutes: input.maximumSessionMinutes,
    maximumDailyMinutes: input.maximumDailyMinutes,
    weeklyTargetMinutes: input.weeklyTargetMinutes,
    earliestStartTime: input.earliestStartTime,
    latestEndTime: input.latestEndTime,
    preferredDays: input.preferredDays,
    weekendAllowed: input.weekendAllowed,
    breakMethod: input.breakMethod,
    bufferPercentage: input.bufferPercentage,
    planningFlexibility: input.planningFlexibility,
    energyProfile: input.energyProfile as PlannerPreferences["energyProfile"],
  };
}

/**
 * Writes a generated plan as a **draft**.
 *
 * Nothing reaches the student's real calendar until they approve it, which is
 * the brief's rule: the engine proposes, the student decides.
 *
 * Sessions carried over from a previous plan are not re-inserted — they already
 * exist as rows and must keep their identity, history and locks.
 */
export async function saveDraftPlan({
  userId,
  horizon,
  result,
  input,
  durationMs,
}: {
  userId: string;
  horizon: PlanHorizon;
  result: PlannerResult;
  input: PlannerInput;
  durationMs: number;
}): Promise<{ planId: string }> {
  const supabase = await createServerSupabaseClient();

  const fresh = result.sessions.filter((session) => !session.preserved);

  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      start_date: horizon.startDate,
      end_date: horizon.endDate,
      status: "draft",
      generation_version: result.algorithmVersion,
      total_planned_minutes: fresh.reduce((sum, session) => sum + session.minutes, 0),
      warnings: JSON.parse(JSON.stringify(result.warnings)),
    })
    .select("id")
    .single();

  if (planError || !plan) {
    throw new Error(`Could not save plan: ${planError?.message ?? "no row returned"}`);
  }

  if (fresh.length > 0) {
    const { error: sessionsError } = await supabase.from("study_sessions").insert(
      fresh.map((session) => ({
        user_id: userId,
        study_plan_id: plan.id,
        task_id: session.taskId,
        course_id: session.courseId,
        title: session.title,
        start_at: fromEpochMinutes(session.start),
        end_at: fromEpochMinutes(session.end),
        planned_minutes: session.minutes,
        status: "planned" as const,
        is_locked: false,
        // Stored as JSON so the UI can translate the reason and the AI layer
        // can read it without re-deriving anything.
        generation_reason: JSON.stringify(session.reason),
        manually_modified: false,
      })),
    );

    if (sessionsError) {
      throw new Error(`Could not save study sessions: ${sessionsError.message}`);
    }
  }

  // The full input and result, so a plan can be explained or replayed later.
  const { error: runError } = await supabase.from("planner_runs").insert({
    user_id: userId,
    study_plan_id: plan.id,
    input_snapshot: JSON.parse(JSON.stringify(input)),
    result_snapshot: JSON.parse(JSON.stringify(result)),
    warnings: JSON.parse(JSON.stringify(result.warnings)),
    algorithm_version: result.algorithmVersion,
    seed: input.seed,
    duration_ms: Math.round(durationMs),
  });

  if (runError) {
    // A missing debug record must not lose the student their plan.
    console.error("[planner] could not record run:", runError.message);
  }

  return { planId: plan.id };
}

export async function getDraftPlan(
  userId: string,
  planId: string,
): Promise<{ plan: StudyPlanRow; sessions: StudySessionRow[] } | null> {
  const supabase = await createServerSupabaseClient();

  const { data: plan, error } = await supabase
    .from("study_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load plan: ${error.message}`);
  if (!plan) return null;

  const { data: sessions, error: sessionsError } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("study_plan_id", planId)
    .eq("user_id", userId)
    .order("start_at", { ascending: true });

  if (sessionsError) throw new Error(`Could not load sessions: ${sessionsError.message}`);

  return { plan, sessions: sessions ?? [] };
}

/** Approves a draft, and supersedes whatever plan it replaces. */
export async function approvePlan(userId: string, planId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { data: plan, error } = await supabase
    .from("study_plans")
    .select("id, start_date, end_date")
    .eq("id", planId)
    .eq("user_id", userId)
    .single();

  if (error || !plan) throw new Error(`Could not find plan: ${error?.message ?? "missing"}`);

  // Any previously approved plan covering the same dates is now history.
  const { error: supersedeError } = await supabase
    .from("study_plans")
    .update({ status: "superseded" })
    .eq("user_id", userId)
    .eq("status", "approved")
    .lte("start_date", plan.end_date)
    .gte("end_date", plan.start_date);

  if (supersedeError) throw new Error(`Could not supersede: ${supersedeError.message}`);

  const { error: approveError } = await supabase
    .from("study_plans")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", userId);

  if (approveError) throw new Error(`Could not approve plan: ${approveError.message}`);
}

/** Throws a draft away, along with the sessions it proposed. */
export async function discardPlan(userId: string, planId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Sessions cascade from the plan row, so one delete is enough.
  const { error } = await supabase
    .from("study_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", userId)
    .eq("status", "draft");

  if (error) throw new Error(`Could not discard plan: ${error.message}`);
}

/** Removes a single proposed session the student rejected. */
export async function rejectSession(userId: string, sessionId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("study_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not remove session: ${error.message}`);
}

export async function setSessionLocked(
  userId: string,
  sessionId: string,
  isLocked: boolean,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("study_sessions")
    .update({ is_locked: isLocked })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not lock session: ${error.message}`);
}

/** Drag to move or resize a proposed session. Marks it as a manual decision. */
export async function moveStudySession(
  userId: string,
  sessionId: string,
  startIso: string,
  endIso: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const minutes = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);

  const { error } = await supabase
    .from("study_sessions")
    .update({
      start_at: startIso,
      end_at: endIso,
      planned_minutes: minutes,
      // So regeneration preserves it — the student has expressed a preference.
      manually_modified: true,
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not move session: ${error.message}`);
}
