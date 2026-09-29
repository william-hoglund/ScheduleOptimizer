import { describe, expect, it } from "vitest";

import {
  getWorkflowStages,
  resolveWorkflowKind,
  WORKFLOW_STAGES,
  type AssessmentWorkflowKind,
} from "@/lib/assessment/workflow-templates";
import type { AssessmentFormat, TaskType } from "@/lib/supabase/types";

const ALL_TASK_TYPES: TaskType[] = [
  "assignment", "exam", "reading", "project", "lab", "presentation", "revision", "other",
  "application", "appointment", "admin", "errand",
];

describe("resolveWorkflowKind", () => {
  it("gives every task type a template — exhaustive, no fallback branch to silently miss one", () => {
    for (const taskType of ALL_TASK_TYPES) {
      const kind = resolveWorkflowKind({ taskType, assessmentFormat: null });
      expect(WORKFLOW_STAGES[kind]).toBeDefined();
    }
  });

  it("maps exam and presentation task types to their own template", () => {
    expect(resolveWorkflowKind({ taskType: "exam", assessmentFormat: null })).toBe("exam");
    expect(resolveWorkflowKind({ taskType: "presentation", assessmentFormat: null })).toBe(
      "presentation",
    );
  });

  it("falls back to the essay template for ordinary written coursework", () => {
    expect(resolveWorkflowKind({ taskType: "assignment", assessmentFormat: null })).toBe("essay");
    expect(resolveWorkflowKind({ taskType: "assignment", assessmentFormat: "individual" })).toBe(
      "essay",
    );
  });

  it("a group format overrides the task type, regardless of what the type itself is", () => {
    const asAssignment = resolveWorkflowKind({ taskType: "assignment", assessmentFormat: "group" });
    const asExam = resolveWorkflowKind({ taskType: "exam", assessmentFormat: "group" });
    expect(asAssignment).toBe("group_project");
    expect(asExam).toBe("group_project");
  });

  it("a presentation format overrides the task type the same way", () => {
    expect(resolveWorkflowKind({ taskType: "assignment", assessmentFormat: "presentation" })).toBe(
      "presentation",
    );
    expect(resolveWorkflowKind({ taskType: "project", assessmentFormat: "presentation" })).toBe(
      "presentation",
    );
  });

  it("an 'exam' or 'other' format does not override the task type", () => {
    // Only "group" and "presentation" are specific enough to override — an
    // exam-format essay task should still get essay stages, not exam stages,
    // since the task itself isn't a sit-down exam.
    const formats: AssessmentFormat[] = ["exam", "other"];
    for (const assessmentFormat of formats) {
      expect(resolveWorkflowKind({ taskType: "assignment", assessmentFormat })).toBe("essay");
    }
  });
});

describe("getWorkflowStages / WORKFLOW_STAGES", () => {
  const kinds = Object.keys(WORKFLOW_STAGES) as AssessmentWorkflowKind[];

  it("gives every template at least two stages and no duplicates", () => {
    for (const kind of kinds) {
      const stages = WORKFLOW_STAGES[kind];
      expect(stages.length).toBeGreaterThanOrEqual(2);
      expect(new Set(stages).size).toBe(stages.length);
    }
  });

  it("keeps every template within the task-breakdown schema's 2-8 subtask range, with room for one split", () => {
    // taskBreakdownSchema allows at most 8 subtasks, and the prompt permits
    // splitting one stage into two — so a template itself must stay at or
    // below 7 to leave that room without ever exceeding the schema's cap.
    for (const kind of kinds) {
      expect(WORKFLOW_STAGES[kind].length).toBeLessThanOrEqual(7);
    }
  });

  it("produces different stage vocabularies for different assessment kinds", () => {
    const exam = getWorkflowStages({ taskType: "exam", assessmentFormat: null });
    const essay = getWorkflowStages({ taskType: "assignment", assessmentFormat: null });
    expect(exam).not.toEqual(essay);
  });
});
