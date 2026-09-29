import "server-only";

import type { AcademicSnapshot } from "@/lib/intelligence/academic-snapshot";
import { listCourses } from "./course-service";
import { listCourseMilestones, listCourseRequirements } from "./course-knowledge-service";
import { loadInsights } from "./insights-service";
import { listTasks } from "./task-service";
import { getWorkloadForecast } from "./workload-forecast-service";

/**
 * The Academic Digital Twin: one call that assembles the read model in
 * `lib/intelligence/academic-snapshot.ts` from the services that already own
 * each piece of data. Nothing here is fetched or computed twice — it only
 * stitches together `listCourses`, `listTasks`, `loadInsights` (Insights'
 * existing loader) and `getWorkloadForecast` (this session's new forecast).
 */

const MAX_UPCOMING_DEADLINES = 10;

export async function getAcademicSnapshot({
  userId,
  timeZone,
  nowIso,
}: {
  userId: string;
  timeZone: string;
  nowIso: string;
}): Promise<AcademicSnapshot> {
  const [courses, tasks, insightsBundle, workload] = await Promise.all([
    listCourses(userId),
    listTasks(userId, { includeCompleted: false }),
    loadInsights({ userId, nowIso, timeZone }).catch((cause) => {
      console.error("[academic-snapshot] insights unavailable:", cause);
      return null;
    }),
    getWorkloadForecast({ userId, timeZone, nowIso }),
  ]);

  const now = Date.parse(nowIso);
  const upcomingDeadlines = tasks
    .filter((task) => task.deadline !== null && Date.parse(task.deadline) >= now)
    .sort((a, b) => Date.parse(a.deadline!) - Date.parse(b.deadline!))
    .slice(0, MAX_UPCOMING_DEADLINES)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      courseId: task.course_id,
      deadline: task.deadline!,
    }));

  // Course knowledge (0011) degrades per course, same as the Course Overview
  // page — a missing/unapplied migration must hide only this field, never
  // take the whole snapshot down with it.
  const knowledgeByCourseId: AcademicSnapshot["knowledgeByCourseId"] = {};
  await Promise.all(
    courses.map(async (course) => {
      try {
        const [requirements, milestones] = await Promise.all([
          listCourseRequirements(userId, course.id),
          listCourseMilestones(userId, course.id),
        ]);
        knowledgeByCourseId[course.id] = { requirements, milestones };
      } catch (cause) {
        console.error(`[academic-snapshot] course knowledge unavailable for ${course.id}:`, cause);
        knowledgeByCourseId[course.id] = { requirements: [], milestones: [] };
      }
    }),
  );

  return {
    generatedAt: nowIso,
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name,
      priority: course.priority,
      archived: course.archived,
    })),
    upcomingDeadlines,
    workload,
    behavior: insightsBundle
      ? { adherence: insightsBundle.insights.adherence, bestBand: insightsBundle.insights.bestBand }
      : null,
    knowledgeByCourseId,
  };
}
