import "server-only";

import {
  computeInsights,
  dailyTotals,
  type InsightSession,
  type Insights,
} from "@/lib/insights/compute-insights";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CourseRow } from "@/lib/supabase/types";

/**
 * Loads what the statistics are computed from.
 *
 * The computation itself is pure and lives in `lib/insights` — this only
 * fetches rows and hands them over.
 */

export type InsightsBundle = {
  insights: Insights;
  daily: Array<{ date: string; plannedMinutes: number; completedMinutes: number }>;
  courses: CourseRow[];
  rangeStart: string;
  rangeEnd: string;
};

export async function loadInsights({
  userId,
  nowIso,
  timeZone,
  days = 28,
}: {
  userId: string;
  nowIso: string;
  timeZone: string;
  days?: number;
}): Promise<InsightsBundle> {
  const supabase = await createServerSupabaseClient();

  const now = Date.parse(nowIso);
  const rangeStart = new Date(now - days * 86_400_000).toISOString();
  // A little into the future, so "planned but not yet due" is visible in the
  // strip without counting against adherence.
  const rangeEnd = new Date(now + 7 * 86_400_000).toISOString();

  const [sessionsResult, tasksResult, coursesResult] = await Promise.all([
    supabase
      .from("study_sessions")
      .select(
        "start_at, end_at, planned_minutes, completed_minutes, status, course_id, study_plan_id",
      )
      .eq("user_id", userId)
      .gte("start_at", rangeStart)
      .lte("start_at", rangeEnd),
    supabase
      .from("tasks")
      .select("id, course_id, title, deadline, estimated_minutes, completed_minutes, status")
      .eq("user_id", userId),
    supabase.from("courses").select("*").eq("user_id", userId).eq("archived", false),
  ]);

  const error = sessionsResult.error ?? tasksResult.error ?? coursesResult.error;
  if (error) throw new Error(`Could not load statistics: ${error.message}`);

  const sessions: InsightSession[] = (sessionsResult.data ?? []).map((row) => ({
    startAt: row.start_at,
    endAt: row.end_at,
    plannedMinutes: row.planned_minutes,
    completedMinutes: row.completed_minutes,
    status: row.status,
    courseId: row.course_id,
    // Sessions created by a reschedule are inserted without a plan, because
    // they replace one session rather than belonging to a whole generated plan.
    // That absence is what identifies them.
    wasRescheduled: row.study_plan_id === null,
  }));

  const tasks = (tasksResult.data ?? []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    deadline: row.deadline,
    estimatedMinutes: row.estimated_minutes,
    completedMinutes: row.completed_minutes,
    status: row.status,
  }));

  return {
    insights: computeInsights({ sessions, tasks, nowIso, timeZone }),
    daily: dailyTotals({ sessions, fromIso: rangeStart, toIso: nowIso, timeZone }),
    courses: coursesResult.data ?? [],
    rangeStart,
    rangeEnd,
  };
}
