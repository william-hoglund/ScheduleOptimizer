import { describe, expect, it } from "vitest";

import {
  buildHorizonForecast,
  classifyPressure,
  deriveMainReason,
} from "@/lib/intelligence/workload-forecast";
import { preferences, task } from "../planner/helpers";

describe("classifyPressure", () => {
  it("is normal when nothing is short", () => {
    expect(classifyPressure(1000, 0)).toBe("normal");
  });

  it("is elevated just inside 15% short", () => {
    expect(classifyPressure(1000, 150)).toBe("elevated");
  });

  it("is high just past the elevated boundary", () => {
    expect(classifyPressure(1000, 151)).toBe("high");
  });

  it("is high right at the 40% boundary", () => {
    expect(classifyPressure(1000, 400)).toBe("high");
  });

  it("is critical just past the high boundary", () => {
    expect(classifyPressure(1000, 401)).toBe("critical");
  });

  it("treats a shortfall with no required work as critical, not a division by zero", () => {
    expect(classifyPressure(0, 30)).toBe("critical");
  });
});

describe("deriveMainReason", () => {
  const courseNameById = new Map([
    ["course-a", "Databases"],
    ["course-b", "Marketing"],
  ]);

  it("returns null once there is nothing to explain", () => {
    expect(deriveMainReason({ atRiskTasks: [], courseNameById, shortfallMinutes: 0 })).toBeNull();
  });

  it("names two courses when at-risk work spans them", () => {
    const reason = deriveMainReason({
      atRiskTasks: [
        { id: "t1", title: "Essay", courseId: "course-a" },
        { id: "t2", title: "Report", courseId: "course-b" },
      ],
      courseNameById,
      shortfallMinutes: 200,
    });
    expect(reason).toEqual({
      code: "overlapping_deadlines",
      details: { courseA: "Databases", courseB: "Marketing" },
    });
  });

  it("names the single task when only one is at risk", () => {
    const reason = deriveMainReason({
      atRiskTasks: [{ id: "t1", title: "Essay", courseId: "course-a" }],
      courseNameById,
      shortfallMinutes: 200,
    });
    expect(reason).toEqual({
      code: "single_heavy_task",
      details: { title: "Essay", courseName: "Databases" },
    });
  });

  it("falls back to a general capacity reason when no single task dominates", () => {
    const reason = deriveMainReason({ atRiskTasks: [], courseNameById, shortfallMinutes: 125 });
    expect(reason).toEqual({ code: "insufficient_time", details: { shortfallHours: 3 } });
  });
});

describe("buildHorizonForecast", () => {
  const now = 0;
  const horizonEnd = 7 * 1440; // 7 days, in minutes

  it("reports normal pressure and no reason when the work fits", () => {
    const forecast = buildHorizonForecast({
      horizonDays: 7,
      tasks: [task({ id: "t1", estimatedMinutes: 120, completedMinutes: 0, deadline: horizonEnd })],
      availableMinutes: 600,
      preferences: preferences(),
      now,
      horizonEnd,
      courseNameById: new Map(),
    });

    expect(forecast.pressure).toBe("normal");
    expect(forecast.mainReason).toBeNull();
    expect(forecast.remedies).toEqual([]);
    expect(forecast.shortfallMinutes).toBe(0);
  });

  it("reports a reason and remedies when the work does not fit", () => {
    const heavy = task({
      id: "t1",
      courseId: "course-a",
      estimatedMinutes: 5000,
      completedMinutes: 0,
      deadline: horizonEnd,
    });

    const forecast = buildHorizonForecast({
      horizonDays: 7,
      tasks: [heavy],
      availableMinutes: 100,
      preferences: preferences(),
      now,
      horizonEnd,
      courseNameById: new Map([["course-a", "Databases"]]),
    });

    expect(forecast.pressure).toBe("critical");
    expect(forecast.mainReason?.code).toBe("single_heavy_task");
    expect(forecast.remedies.length).toBeGreaterThan(0);
  });

  // Mutation check: a forecast that always reported "normal" regardless of
  // input would pass a naive "it returns a HorizonForecast" test. Asserting
  // the *specific* pressure/reason distinguishes fit-vs-not, which is the
  // property worth having.
  it("actually distinguishes a feasible week from an infeasible one", () => {
    const easy = buildHorizonForecast({
      horizonDays: 7,
      tasks: [task({ id: "t1", estimatedMinutes: 60, deadline: horizonEnd })],
      availableMinutes: 600,
      preferences: preferences(),
      now,
      horizonEnd,
      courseNameById: new Map(),
    });
    const hard = buildHorizonForecast({
      horizonDays: 7,
      tasks: [task({ id: "t1", estimatedMinutes: 6000, deadline: horizonEnd })],
      availableMinutes: 600,
      preferences: preferences(),
      now,
      horizonEnd,
      courseNameById: new Map(),
    });

    expect(easy.pressure).not.toBe(hard.pressure);
  });
});
