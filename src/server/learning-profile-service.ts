import "server-only";

import { computeLearningProfile, type ComputedInsight } from "@/lib/learning/compute-learning-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LearningProfileInsightRow } from "@/lib/supabase/types";

/**
 * The Personal Learning Profile's database bridge. `compute-learning-profile.ts`
 * stays pure — this is the only place that loads sessions/tasks and writes
 * `learning_profile_insights`, same split as every other `*-service.ts` here.
 *
 * `refreshLearningProfile` is called from the Insights page on every view,
 * same "recompute when looked at" pattern `study-group-service.ts`'s
 * `refreshMyScores` already establishes — cheap enough at this scale, and it
 * means the profile is never more than one page load stale.
 */

export async function refreshLearningProfile({
  userId,
  timeZone,
  nowIso,
}: {
  userId: string;
  timeZone: string;
  nowIso: string;
}): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Deliberately unbounded by date, unlike Insights' rolling 28-day window —
  // this is a slower-changing, longer-horizon profile, and the minimum-sample
  // gates in `computeLearningProfile` already handle "not enough data yet"
  // regardless of how wide the window is.
  const [sessionsResult, tasksResult] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("course_id, status, start_at, end_at, study_plan_id")
      .eq("user_id", userId),
    supabase.from("tasks").select("course_id, estimated_minutes, completed_minutes, status").eq(
      "user_id",
      userId,
    ),
  ]);

  const error = sessionsResult.error ?? tasksResult.error;
  if (error) throw new Error(`Could not load data for the learning profile: ${error.message}`);

  const sessions = (sessionsResult.data ?? []).map((row) => ({
    courseId: row.course_id,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    // Same convention as insights-service.ts: a session inserted without a
    // plan is one a reschedule created to replace another.
    wasRescheduled: row.study_plan_id === null,
  }));

  const tasks = (tasksResult.data ?? []).map((row) => ({
    courseId: row.course_id,
    estimatedMinutes: row.estimated_minutes,
    completedMinutes: row.completed_minutes,
    status: row.status,
  }));

  const computed = computeLearningProfile({ sessions, tasks, nowIso, timeZone });

  // `course_postponement_risk` only ever exists while a course is actually
  // flagged — a course that recovers must stop being shown as at-risk, so any
  // existing row for a course no longer in this refresh's candidate set is
  // removed outright rather than left stale.
  const currentRiskCourseIds = new Set(
    computed
      .filter((insight): insight is Extract<ComputedInsight, { type: "course_postponement_risk" }> =>
        insight.type === "course_postponement_risk",
      )
      .map((insight) => insight.courseId),
  );

  const { data: existingRiskRows, error: existingRiskError } = await supabase
    .from("learning_profile_insights")
    .select("course_id")
    .eq("user_id", userId)
    .eq("insight_type", "course_postponement_risk");
  if (existingRiskError) {
    throw new Error(`Could not load the learning profile: ${existingRiskError.message}`);
  }

  const staleCourseIds = (existingRiskRows ?? [])
    .map((row) => row.course_id)
    .filter((courseId): courseId is string => courseId !== null && !currentRiskCourseIds.has(courseId));

  if (staleCourseIds.length > 0) {
    const { error: cleanupError } = await supabase
      .from("learning_profile_insights")
      .delete()
      .eq("user_id", userId)
      .eq("insight_type", "course_postponement_risk")
      .in("course_id", staleCourseIds);
    if (cleanupError) throw new Error(`Could not clean up the learning profile: ${cleanupError.message}`);
  }

  if (computed.length === 0) return;

  // `overridden_by_user` is deliberately absent from this payload — Postgres's
  // ON CONFLICT ... DO UPDATE only touches columns present here, so a
  // student's dismissal survives every future refresh untouched.
  const { error: upsertError } = await supabase.from("learning_profile_insights").upsert(
    computed.map((insight) => ({
      user_id: userId,
      insight_type: insight.type,
      course_id: insight.courseId,
      computed_value: insight.value,
      confidence: insight.confidence,
      observation_count: insight.observationCount,
      computed_at: nowIso,
    })),
    { onConflict: "user_id,insight_type,scope_key" },
  );
  if (upsertError) throw new Error(`Could not save the learning profile: ${upsertError.message}`);
}

export async function listLearningProfileInsights(userId: string): Promise<LearningProfileInsightRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_profile_insights")
    .select("*")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false });

  if (error) throw new Error(`Could not load the learning profile: ${error.message}`);
  return data ?? [];
}

export async function setLearningProfileOverride(
  userId: string,
  insightId: string,
  overridden: boolean,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("learning_profile_insights")
    .update({ overridden_by_user: overridden })
    .eq("id", insightId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not update the learning profile: ${error.message}`);
}
