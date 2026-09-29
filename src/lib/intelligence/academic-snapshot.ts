import type { HorizonForecast } from "./workload-forecast";
import type { CourseMilestoneRow, CourseRequirementRow } from "@/lib/supabase/types";

/**
 * The read-model shape of "everything the app currently knows about this
 * student's academic situation" — courses, what's due, the workload forecast,
 * behavioral signal from Insights, and per-course syllabus knowledge.
 *
 * Deliberately just a type plus an aggregator (in
 * `src/server/academic-snapshot-service.ts`), not a stored table: every field
 * here already has a source of truth elsewhere (`courses`, `tasks`,
 * `study_sessions`, `course_requirements`/`course_milestones`), so this is
 * "prefer calculated state over duplicated data" applied directly — the same
 * reasoning `remaining_minutes` being a generated column already follows at
 * the database level.
 *
 * This is the seam future work reads from (a daily briefing, a weekly review,
 * the advisor's context) rather than each of those re-deriving the same
 * numbers independently — see docs/PLAN.md Session 20's deferred-work table.
 */

export type AcademicSnapshot = {
  generatedAt: string;
  courses: Array<{ id: string; name: string; priority: number; archived: boolean }>;
  upcomingDeadlines: Array<{
    taskId: string;
    title: string;
    courseId: string | null;
    deadline: string;
  }>;
  workload: HorizonForecast[];
  /** null only if Insights itself could not load — mirrors its own degrade pattern. */
  behavior: {
    adherence: number | null;
    bestBand: "morning" | "afternoon" | "evening" | null;
  } | null;
  /**
   * Empty for a course if 0011's tables are unavailable or the course has no
   * uploaded documents yet — never a thrown error (see
   * `academic-snapshot-service.ts`'s per-course try/catch, same degrade
   * pattern as `src/app/(dashboard)/courses/[id]/page.tsx`).
   */
  knowledgeByCourseId: Record<
    string,
    { requirements: CourseRequirementRow[]; milestones: CourseMilestoneRow[] }
  >;
};
