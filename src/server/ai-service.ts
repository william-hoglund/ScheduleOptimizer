import "server-only";

import type { Locale } from "@/i18n/config";
import {
  askAdvisor as askAdvisorAi,
  boundAdvisorContext,
  boundExplainPlanSessions,
  breakdownTask as breakdownTaskAi,
  explainPlan as explainPlanAi,
  extractCourseKnowledge as extractCourseKnowledgeAi,
  isAiEnabled,
  type AdvisorCourse,
  type AdvisorOutcome,
  type AdvisorTask,
  type CourseExtraction,
  type PlanExplanation,
  type TaskBreakdown,
} from "@/lib/ai";
import { resolvePlannerCommand, type CommandContext, type ResolvedCommand } from "@/lib/ai/resolve-command";
import type { PlannerCommand } from "@/lib/ai/schemas/advisor";
import { utcToLocalDate, utcToWallClock } from "@/lib/calendar/time";
import { DocumentTextExtractionError, extractDocumentText } from "@/lib/documents/extract-text";
import { fromEpochMinutes } from "@/lib/planner/time-grid";
import type { PlannerResult } from "@/lib/planner/types";
import type { Segment } from "@/lib/segments";
import { isErrand } from "@/lib/tasks/task-kinds";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateDraftPlan } from "@/features/planner/actions";
import { nowIso } from "./clock";
import { createTask } from "./task-service";
import { defaultTaskInput } from "@/lib/validation/task";
import { getCourse, listCourses, setCoursePriority } from "./course-service";
import {
  downloadCourseDocumentBytes,
  getAssessmentDetailForTask,
  getCourseDocument,
  markDocumentFailed,
  markDocumentProcessing,
} from "./course-knowledge-service";
import { getWorkflowStages } from "@/lib/assessment/workflow-templates";
import { listTasks } from "./task-service";

/**
 * Where the database meets the AI layer.
 *
 * `lib/ai/` never imports Supabase — it takes plain data in and gives plain
 * data back, same discipline as `lib/planner/`. Everything here does the
 * translating: load rows, shape them into the bounded, plain-data inputs the
 * prompts expect, call the AI layer, and (for the plan explanation only)
 * write the result back.
 */

// ------------------------------------------------------------- explanation ---

/**
 * Cached on `study_plans.explanation` (a plain text column that has existed
 * since Session 4, unused until now) so reopening the planner page does not
 * re-spend a request, and so the explanation a student read stays the one
 * that is shown — regenerating the plan makes a new draft row, so this never
 * goes stale under them.
 */
export async function getOrCreatePlanExplanation({
  userId,
  planId,
  timeZone,
  locale,
  segment,
}: {
  userId: string;
  planId: string;
  timeZone: string;
  locale: Locale;
  segment: Segment;
}): Promise<PlanExplanation | null> {
  if (!isAiEnabled()) return null;

  const supabase = await createServerSupabaseClient();

  const { data: plan } = await supabase
    .from("study_plans")
    .select("id, explanation")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan) return null;

  if (plan.explanation) {
    try {
      return JSON.parse(plan.explanation) as PlanExplanation;
    } catch {
      // Fall through and regenerate rather than fail the page over stored junk.
    }
  }

  const { data: run } = await supabase
    .from("planner_runs")
    .select("result_snapshot")
    .eq("study_plan_id", planId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run?.result_snapshot) return null;

  const result = run.result_snapshot as unknown as PlannerResult;
  const courses = await listCourses(userId, { includeArchived: true });
  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));

  const bounded = boundExplainPlanSessions(
    result.sessions.map((session) => ({
      title: session.title,
      courseName: session.courseId ? (courseNameById.get(session.courseId) ?? null) : null,
      startLocal: utcToWallClock(fromEpochMinutes(session.start), timeZone),
      minutes: session.minutes,
      reasonCode: session.reason.code,
    })),
  );

  const explanation = await explainPlanAi({
    locale,
    segment,
    totalPlannedMinutes: result.quality.totalPlannedMinutes,
    activeDays: result.quality.activeDays,
    longestGapDays: result.quality.longestGapDays,
    coveragePercent: Math.round(result.quality.coverage * 100),
    warningCodes: result.warnings.map((warning) => warning.code),
    ...bounded,
  });
  if (!explanation) return null;

  const { error } = await supabase
    .from("study_plans")
    .update({ explanation: JSON.stringify(explanation) })
    .eq("id", planId)
    .eq("user_id", userId);
  if (error) console.error("[ai-service] could not cache plan explanation:", error.message);

  return explanation;
}

// -------------------------------------------------------------- breakdown ---

export async function generateTaskBreakdown({
  userId,
  taskId,
  timeZone,
  locale,
}: {
  userId: string;
  taskId: string;
  timeZone: string;
  locale: Locale;
}): Promise<TaskBreakdown | null> {
  if (!isAiEnabled()) return null;

  const supabase = await createServerSupabaseClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!task) return null;

  const remainingMinutes = Math.max(task.estimated_minutes - task.completed_minutes, 15);

  // A task backed by a reviewed syllabus fact (docs/PLAN.md's Assessment
  // Intelligence feature) gets a type-aware stage checklist instead of a
  // generic minute split — see `lib/assessment/workflow-templates.ts`. An
  // ordinary task has no `assessment_details` row, so `stageNames` stays
  // undefined and behavior is unchanged.
  const assessmentDetail = await getAssessmentDetailForTask(userId, taskId);
  const stageNames = assessmentDetail
    ? getWorkflowStages({ taskType: task.task_type, assessmentFormat: assessmentDetail.assessment_format })
    : undefined;

  return breakdownTaskAi({
    locale,
    title: task.title,
    taskType: task.task_type,
    remainingMinutes,
    deadlineLocal: task.deadline ? utcToWallClock(task.deadline, timeZone) : null,
    difficulty: task.difficulty,
    stageNames,
  });
}

/** Subtasks are one level deep (PLAN.md §"Session 4 decisions") — refuses to nest under a subtask. */
export async function createSubtasksFromBreakdown({
  userId,
  timeZone,
  parentTaskId,
  subtasks,
}: {
  userId: string;
  timeZone: string;
  parentTaskId: string;
  subtasks: Array<{ title: string; estimatedMinutes: number }>;
}): Promise<{ created: number } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: parent } = await supabase
    .from("tasks")
    .select("course_id, task_type, parent_task_id")
    .eq("id", parentTaskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!parent) return { error: "notFound" };
  if (parent.parent_task_id) return { error: "alreadySubtask" };

  const taskType = isErrand(parent.task_type) ? "other" : parent.task_type;

  for (const subtask of subtasks) {
    await createTask(
      userId,
      {
        ...defaultTaskInput,
        title: subtask.title,
        courseId: parent.course_id,
        parentTaskId,
        taskType,
        estimatedMinutes: subtask.estimatedMinutes,
      },
      timeZone,
    );
  }

  return { created: subtasks.length };
}

// ------------------------------------------------------------ course knowledge ---

/**
 * Reads a course document and asks the AI to extract structured facts from it
 * (docs/PLAN.md §40.2). Returns the proposed extraction for the student to
 * review — nothing is written to `course_requirements` / `assessment_details`
 * / `course_milestones` here. `saveExtractionSelections` in
 * `course-knowledge-service.ts` is the only function that writes, and only
 * after the student confirms.
 */
export async function generateCourseExtraction({
  userId,
  documentId,
  locale,
}: {
  userId: string;
  documentId: string;
  locale: Locale;
}): Promise<{ ok: true; extraction: CourseExtraction } | { ok: false; error: string }> {
  if (!isAiEnabled()) return { ok: false, error: "aiUnavailable" };

  const document = await getCourseDocument(userId, documentId);
  if (!document) return { ok: false, error: "notFound" };

  const course = await getCourse(userId, document.course_id);
  if (!course) return { ok: false, error: "notFound" };

  await markDocumentProcessing(userId, documentId);

  try {
    const bytes = await downloadCourseDocumentBytes(userId, document);
    const { pages } = await extractDocumentText(bytes, document.mime_type);

    if (pages.every((page) => page.text.trim().length === 0)) {
      await markDocumentFailed(userId, documentId, "No extractable text found in the document");
      return { ok: false, error: "noText" };
    }

    const extraction = await extractCourseKnowledgeAi({ locale, courseName: course.name, pages });
    if (!extraction) {
      await markDocumentFailed(userId, documentId, "The AI provider did not return a usable extraction");
      return { ok: false, error: "extractionFailed" };
    }

    // Left as "processing" on purpose: `processing_status` only reaches
    // "completed" once `saveExtractionSelections` actually writes rows, so a
    // student who reviews but never confirms sees the document as still
    // needing attention rather than silently "done".
    return { ok: true, extraction };
  } catch (cause) {
    const message =
      cause instanceof DocumentTextExtractionError ? cause.message : "Could not read the document";
    await markDocumentFailed(userId, documentId, message);
    console.error("[ai-service] course extraction failed:", cause);
    return { ok: false, error: "extractionFailed" };
  }
}

// ---------------------------------------------------------------- advisor ---

async function loadAdvisorContext(
  userId: string,
  timeZone: string,
): Promise<{
  courses: AdvisorCourse[];
  upcomingTasks: AdvisorTask[];
  hasCurrentPlan: boolean;
  commandContext: Omit<CommandContext, "today">;
}> {
  const supabase = await createServerSupabaseClient();

  const [courses, tasks, activePlanResult] = await Promise.all([
    listCourses(userId),
    listTasks(userId, { includeCompleted: false }),
    supabase
      .from("study_plans")
      .select("start_date, end_date")
      .eq("user_id", userId)
      .in("status", ["draft", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));
  const activePlan = activePlanResult.data;

  const bounded = boundAdvisorContext(
    courses.map((course) => ({ id: course.id, name: course.name, priority: course.priority })),
    tasks.map((task) => ({
      id: task.id,
      title: task.title,
      courseName: task.course_id ? (courseNameById.get(task.course_id) ?? null) : null,
      deadlineLocal: task.deadline ? utcToWallClock(task.deadline, timeZone) : null,
      priority: task.priority,
    })),
  );

  return {
    ...bounded,
    hasCurrentPlan: Boolean(activePlan),
    commandContext: {
      validCourseIds: new Set(courses.map((course) => course.id)),
      currentPlanHorizon: activePlan
        ? { startDate: activePlan.start_date, endDate: activePlan.end_date }
        : null,
    },
  };
}

export type AdvisorAskResult =
  | {
      ok: true;
      message: string;
      inScope: boolean;
      /** Present only when the proposal survived re-validation against real data. */
      resolvedAction: ResolvedCommand | null;
      /**
       * The exact, unvalidated thing the model proposed. Sent back to the
       * client only so it can be echoed back on confirm — `applyResolvedCommand`
       * re-validates it from scratch at that point rather than trusting this
       * snapshot, because courses or tasks may have changed in between.
       */
      rawAction: PlannerCommand;
    }
  | { ok: false; reason: "empty" | "tooLong" | "unavailable" };

export async function askAdvisor({
  userId,
  timeZone,
  locale,
  segment,
  today,
  message,
}: {
  userId: string;
  timeZone: string;
  locale: Locale;
  segment: Segment;
  today: string;
  message: string;
}): Promise<AdvisorAskResult> {
  if (!isAiEnabled()) return { ok: false, reason: "unavailable" };

  const context = await loadAdvisorContext(userId, timeZone);

  const outcome: AdvisorOutcome = await askAdvisorAi({
    locale,
    segment,
    todayLocal: today,
    message,
    courses: context.courses,
    upcomingTasks: context.upcomingTasks,
    hasCurrentPlan: context.hasCurrentPlan,
  });

  if (!outcome.ok) return outcome;

  const resolved = outcome.reply.inScope
    ? resolvePlannerCommand(outcome.reply.action, { ...context.commandContext, today })
    : null;

  return {
    ok: true,
    message: outcome.reply.message,
    inScope: outcome.reply.inScope,
    resolvedAction: resolved,
    rawAction: outcome.reply.action,
  };
}

/**
 * Runs a command the student has already seen and approved.
 *
 * `regenerate_plan` calls the same planner action a human uses from the
 * setup form; `set_course_priority` calls the same setter the course form
 * uses. The AI layer is never the thing writing to the database.
 */
export async function applyResolvedCommand({
  userId,
  timeZone,
  command,
}: {
  userId: string;
  timeZone: string;
  command: PlannerCommand;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = await loadAdvisorContext(userId, timeZone);
  const today = utcToLocalDate(nowIso(), timeZone);
  const resolved = resolvePlannerCommand(command, { ...context.commandContext, today });
  if (!resolved) return { ok: false, error: "staleProposal" };

  switch (resolved.kind) {
    case "none":
      return { ok: true };

    case "set_course_priority": {
      try {
        await setCoursePriority(userId, resolved.courseId, resolved.priority);
        return { ok: true };
      } catch (cause) {
        console.error("[ai-service] setCoursePriority failed:", cause);
        return { ok: false, error: "unexpected" };
      }
    }

    case "regenerate_plan": {
      // The exact same action the planner setup form itself calls — the
      // advisor never has a database write path that a human's own actions
      // don't already have.
      const result = await generateDraftPlan({
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        courseIds: resolved.courseIds,
        overrides: {},
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }
  }
}
