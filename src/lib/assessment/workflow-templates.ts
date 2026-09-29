import type { AssessmentFormat, TaskType } from "@/lib/supabase/types";

/**
 * Type-aware assessment breakdown templates (docs/PLAN.md's Assessment
 * Intelligence feature). Deterministic stage vocabulary — the AI's job stays
 * "allocate time and write subtasks", never "invent the checklist"; see
 * `src/lib/ai/prompts/task-breakdown.ts`'s `stageNames` for where this feeds
 * in.
 *
 * Signals available to choose a template are exactly what `tasks.task_type`
 * and `assessment_details.assessment_format` (0011) carry — no new column is
 * added for this. Mirrors the exhaustive-`Record<TaskType, X>` style already
 * used in `lib/tasks/task-kinds.ts` and
 * `lib/planner/tasks/calculate-task-urgency.ts`'s `TYPE_IMPORTANCE`: every
 * `TaskType` is listed, so a new task type fails to typecheck here until it's
 * given a template.
 */

export type AssessmentWorkflowKind = "essay" | "presentation" | "exam" | "group_project" | "project" | "lab";

/**
 * Base mapping from what a task *is*. The errand-like types are listed only
 * to keep this an exhaustive `Record<TaskType, X>` — `resolveWorkflowKind` is
 * only ever called for a task that already has an `assessment_details` row,
 * which an errand never does.
 */
const BASE_KIND_BY_TASK_TYPE: Record<TaskType, AssessmentWorkflowKind> = {
  exam: "exam",
  presentation: "presentation",
  project: "project",
  lab: "lab",
  assignment: "essay",
  reading: "essay",
  revision: "essay",
  other: "essay",
  application: "essay",
  appointment: "essay",
  admin: "essay",
  errand: "essay",
};

/**
 * `assessment_format` overrides the task-type default when it says something
 * more specific than the type alone does — a group assignment needs role
 * allocation regardless of whether it's filed as an "assignment" or a
 * "project".
 */
export function resolveWorkflowKind(input: {
  taskType: TaskType;
  assessmentFormat: AssessmentFormat | null;
}): AssessmentWorkflowKind {
  if (input.assessmentFormat === "group") return "group_project";
  if (input.assessmentFormat === "presentation") return "presentation";
  return BASE_KIND_BY_TASK_TYPE[input.taskType];
}

/**
 * Canonical English stage phrases. Not i18n keys: these feed the AI prompt,
 * which is built in English and already instructs the model to reply in the
 * request's locale (matching `buildAdvisorPrompt`/`buildExplainPlanPrompt`),
 * so the model produces localized subtask titles the same way it already does
 * with no stage list at all — no new translation surface needed.
 */
export const WORKFLOW_STAGES: Record<AssessmentWorkflowKind, readonly string[]> = {
  essay: [
    "Understand the question",
    "Research",
    "Develop your argument",
    "Outline",
    "Draft",
    "Analysis",
    "Editing and referencing",
  ],
  presentation: ["Research", "Structure", "Slides", "Speaker notes", "Rehearsal", "Final review"],
  exam: [
    "Content mapping",
    "Lecture review",
    "Practice questions",
    "Weak-topic review",
    "Mock exam",
    "Final revision",
  ],
  group_project: [
    "Requirements",
    "Role allocation",
    "Research",
    "Your contribution",
    "Integration",
    "Review and submission",
  ],
  project: ["Requirements", "Research", "Build", "Review", "Finalize"],
  lab: ["Preparation", "Conduct / implement", "Analyze results", "Write up", "Submission check"],
};

export function getWorkflowStages(input: {
  taskType: TaskType;
  assessmentFormat: AssessmentFormat | null;
}): readonly string[] {
  return WORKFLOW_STAGES[resolveWorkflowKind(input)];
}
