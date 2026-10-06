import { describe, expect, it } from "vitest";

import { buildPlanNotesPrompt } from "@/lib/ai/prompts/plan-notes";
import { applyPlanNotes } from "@/lib/planner/apply-plan-notes";
import { generatePlan } from "@/lib/planner/generate-plan";
import { epochMinutesToLocalDate } from "@/lib/planner/time-grid";
import { STOCKHOLM, input, local, task } from "./helpers";

// helpers' week: Mon 2026-08-03 … Fri 2026-08-07.
const base = () =>
  input({
    tasks: [
      task({ id: "a1", title: "Assessment 1", estimatedMinutes: 120, deadline: local("2026-08-07", "20:00") }),
      task({ id: "other", title: "Reading", estimatedMinutes: 60, deadline: local("2026-08-07", "20:00") }),
    ],
  });

describe("planning notes", () => {
  it("blocks the away days entirely and pulls the task's work before its finish-by date", () => {
    const { input: withNotes, applied } = applyPlanNotes(base(), {
      unavailable: [{ startDate: "2026-08-06", endDate: "2026-08-10", label: "Whitsundays" }],
      finishBy: [{ taskId: "a1", date: "2026-08-04", label: "Assessment 1 first" }],
      notUnderstood: [],
    });
    expect(applied).toHaveLength(2);

    const result = generatePlan(withNotes);
    for (const session of result.sessions) {
      expect(["2026-08-06", "2026-08-07"]).not.toContain(epochMinutesToLocalDate(session.start, STOCKHOLM));
      if (session.taskId === "a1") expect(session.end).toBeLessThanOrEqual(local("2026-08-05", "00:00"));
    }
    expect(result.sessions.some((s) => s.taskId === "a1")).toBe(true);
  });

  it("never loosens an existing deadline", () => {
    const { input: withNotes } = applyPlanNotes(base(), {
      unavailable: [],
      finishBy: [{ taskId: "a1", date: "2026-09-30", label: "later" }],
      notUnderstood: [],
    });
    expect(withNotes.tasks.find((t) => t.id === "a1")?.deadline).toBe(local("2026-08-07", "20:00"));
  });

  it("rejects unknown tasks and backwards ranges instead of guessing", () => {
    const { applied, rejected, input: withNotes } = applyPlanNotes(base(), {
      unavailable: [{ startDate: "2026-08-10", endDate: "2026-08-06", label: "backwards" }],
      finishBy: [{ taskId: "made-up", date: "2026-08-04", label: "ghost task" }],
      notUnderstood: ["gym on Tuesdays"],
    });
    expect(applied).toEqual([]);
    expect(rejected).toEqual(["gym on Tuesdays", "backwards", "ghost task"]);
    expect(withNotes.fixedEvents).toHaveLength(0);
  });

  it("gives the model a weekday calendar so relative days resolve correctly", () => {
    const { prompt } = buildPlanNotesPrompt({
      note: "away Thursday to Monday",
      today: "2026-10-06",
      horizonStart: "2026-10-06",
      horizonEnd: "2026-10-19",
      tasks: [{ id: "t1", title: "Assessment 1", courseName: "AI", deadline: "2026-10-20" }],
    });
    expect(prompt).toContain("2026-10-06 Tuesday (today)");
    expect(prompt).toContain("2026-10-08 Thursday");
    expect(prompt).toContain("id=t1 | Assessment 1 | course: AI | due 2026-10-20");
  });
});
