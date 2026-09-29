import { describe, expect, it } from "vitest";

import { resolvePlannerCommand, type CommandContext } from "@/lib/ai/resolve-command";

const context = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  validCourseIds: new Set(["course-1", "course-2"]),
  currentPlanHorizon: { startDate: "2026-09-21", endDate: "2026-09-27" },
  today: "2026-09-23",
  ...overrides,
});

describe("resolvePlannerCommand — regenerate_plan", () => {
  it("keeps course ids that actually exist", () => {
    const resolved = resolvePlannerCommand(
      { kind: "regenerate_plan", courseIds: ["course-1"], timeframe: "current_plan", label: "Focus" },
      context(),
    );
    expect(resolved).toEqual({
      kind: "regenerate_plan",
      courseIds: ["course-1"],
      startDate: "2026-09-21",
      endDate: "2026-09-27",
      label: "Focus",
    });
  });

  it("refuses rather than silently broadening scope when every proposed id is hallucinated", () => {
    // This is the case that matters: the model named a course, but it does not
    // exist in this account. Falling through to "every course" would be a
    // different action than what was asked for and approved.
    const resolved = resolvePlannerCommand(
      {
        kind: "regenerate_plan",
        courseIds: ["course-does-not-exist"],
        timeframe: "current_plan",
        label: "Focus",
      },
      context(),
    );
    expect(resolved).toBeNull();
  });

  it("drops only the ids that don't resolve, keeping the ones that do", () => {
    const resolved = resolvePlannerCommand(
      {
        kind: "regenerate_plan",
        courseIds: ["course-1", "course-does-not-exist"],
        timeframe: "current_plan",
        label: "Focus",
      },
      context(),
    );
    expect(resolved).toMatchObject({ courseIds: ["course-1"] });
  });

  it("an empty course list means every course, and is always valid", () => {
    const resolved = resolvePlannerCommand(
      { kind: "regenerate_plan", courseIds: [], timeframe: "current_plan", label: "Everything" },
      context(),
    );
    expect(resolved).toMatchObject({ courseIds: [] });
  });

  it("falls back to the next 7 days when there is no current plan to extend", () => {
    const resolved = resolvePlannerCommand(
      { kind: "regenerate_plan", courseIds: [], timeframe: "current_plan", label: "Focus" },
      context({ currentPlanHorizon: null }),
    );
    expect(resolved).toMatchObject({ startDate: "2026-09-23", endDate: "2026-09-29" });
  });

  it("next_7_days always starts today regardless of any existing plan", () => {
    const resolved = resolvePlannerCommand(
      { kind: "regenerate_plan", courseIds: [], timeframe: "next_7_days", label: "Focus" },
      context(),
    );
    expect(resolved).toMatchObject({ startDate: "2026-09-23", endDate: "2026-09-29" });
  });
});

describe("resolvePlannerCommand — set_course_priority", () => {
  it("accepts a real course id", () => {
    const resolved = resolvePlannerCommand(
      { kind: "set_course_priority", courseId: "course-2", priority: 5, label: "Raise priority" },
      context(),
    );
    expect(resolved).toEqual({
      kind: "set_course_priority",
      courseId: "course-2",
      priority: 5,
      label: "Raise priority",
    });
  });

  it("refuses a course id that does not belong to this account", () => {
    const resolved = resolvePlannerCommand(
      { kind: "set_course_priority", courseId: "someone-elses-course", priority: 5, label: "x" },
      context(),
    );
    expect(resolved).toBeNull();
  });
});

describe("resolvePlannerCommand — apply_forecast_remedy", () => {
  it("passes through unchanged — there is no account-specific id to validate", () => {
    const resolved = resolvePlannerCommand(
      { kind: "apply_forecast_remedy", remedyCode: "allow_weekends", label: "Allow weekend study" },
      context(),
    );
    expect(resolved).toEqual({
      kind: "apply_forecast_remedy",
      remedyCode: "allow_weekends",
      label: "Allow weekend study",
    });
  });

  it("passes through the other remedy code the same way", () => {
    const resolved = resolvePlannerCommand(
      { kind: "apply_forecast_remedy", remedyCode: "extend_daily_limit", label: "Raise your daily cap" },
      context(),
    );
    expect(resolved).toMatchObject({ remedyCode: "extend_daily_limit" });
  });
});

describe("resolvePlannerCommand — none", () => {
  it("passes through unchanged", () => {
    expect(resolvePlannerCommand({ kind: "none" }, context())).toEqual({ kind: "none" });
  });
});
