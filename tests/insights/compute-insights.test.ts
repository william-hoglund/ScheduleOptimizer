import { describe, expect, it } from "vitest";

import {
  computeInsights,
  dailyTotals,
  type InsightSession,
  type InsightTask,
} from "@/lib/insights/compute-insights";

/**
 * Study statistics.
 *
 * The behavioural rules that matter here are about restraint, not arithmetic:
 * future work must not count against a student, planning less must not look
 * like failing, and a "pattern" must not be reported from two data points.
 */

const STOCKHOLM = "Europe/Stockholm";
const NOW = "2026-08-10T12:00:00.000Z"; // Monday 14:00 local

function session(overrides: Partial<InsightSession> = {}): InsightSession {
  return {
    startAt: "2026-08-05T07:00:00.000Z",
    endAt: "2026-08-05T08:00:00.000Z",
    plannedMinutes: 60,
    completedMinutes: 60,
    status: "completed",
    courseId: "course-1",
    wasRescheduled: false,
    ...overrides,
  };
}

function task(overrides: Partial<InsightTask> = {}): InsightTask {
  return {
    id: "task-1",
    courseId: "course-1",
    title: "Statistics exam",
    deadline: "2026-08-20T15:00:00.000Z",
    estimatedMinutes: 300,
    completedMinutes: 0,
    status: "in_progress",
    ...overrides,
  };
}

describe("what counts", () => {
  it("ignores sessions that have not happened yet", () => {
    const result = computeInsights({
      sessions: [
        session({ status: "completed" }),
        // Next week — not done, but not a failure either.
        session({
          startAt: "2026-08-17T07:00:00.000Z",
          endAt: "2026-08-17T08:00:00.000Z",
          status: "planned",
          completedMinutes: 0,
        }),
      ],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.consideredSessions).toBe(1);
    expect(result.plannedMinutes).toBe(60);
    expect(result.adherence).toBe(1);
  });

  it("ignores cancelled sessions entirely", () => {
    const result = computeInsights({
      sessions: [session({ status: "cancelled", completedMinutes: 0 })],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.consideredSessions).toBe(0);
    expect(result.adherence).toBeNull();
  });

  it("reports no adherence at all before anything is planned", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    // Null, not zero: nothing planned is not the same as nothing done.
    expect(result.adherence).toBeNull();
    expect(result.averageSessionMinutes).toBeNull();
  });
});

describe("adherence does not punish planning less", () => {
  it("scores a small plan kept in full the same as a large one", () => {
    const light = computeInsights({
      sessions: [session({ plannedMinutes: 30, completedMinutes: 30 })],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    const heavy = computeInsights({
      sessions: [session({ plannedMinutes: 240, completedMinutes: 240 })],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(light.adherence).toBe(1);
    expect(heavy.adherence).toBe(light.adherence);
  });

  it("never exceeds 100%, even after overshooting", () => {
    const result = computeInsights({
      sessions: [session({ plannedMinutes: 60, completedMinutes: 90 })],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.adherence).toBe(1);
  });

  it("counts partial work as partial credit", () => {
    const result = computeInsights({
      sessions: [session({ status: "partial", plannedMinutes: 60, completedMinutes: 30 })],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.adherence).toBe(0.5);
  });
});

describe("time-of-day patterns", () => {
  it("says nothing until there is enough history", () => {
    const result = computeInsights({
      sessions: [session(), session(), session()],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    // Three sessions is a coincidence, not a pattern.
    expect(result.bestBand).toBeNull();
  });

  it("identifies the band with the best completion once there is", () => {
    const morning = (completed: number) =>
      session({
        startAt: "2026-08-05T07:00:00.000Z", // 09:00 local
        endAt: "2026-08-05T08:00:00.000Z",
        completedMinutes: completed,
        status: completed === 60 ? "completed" : "partial",
      });
    const evening = (completed: number) =>
      session({
        startAt: "2026-08-05T17:00:00.000Z", // 19:00 local
        endAt: "2026-08-05T18:00:00.000Z",
        completedMinutes: completed,
        status: completed === 60 ? "completed" : "missed",
      });

    const result = computeInsights({
      sessions: [
        morning(60),
        morning(60),
        morning(60),
        evening(0),
        evening(0),
        evening(15),
      ],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.bestBand).toBe("morning");
    expect(result.bandCompletion.morning.completed).toBe(180);
    expect(result.bandCompletion.evening.completed).toBe(15);
  });

  it("bands by the student's local clock, not UTC", () => {
    // 22:00 UTC is 00:00 local the next day in Stockholm summer — evening by
    // UTC, but a new day locally.
    const result = computeInsights({
      sessions: [
        session({
          startAt: "2026-08-05T06:30:00.000Z", // 08:30 local — morning
          endAt: "2026-08-05T07:30:00.000Z",
        }),
      ],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.bandCompletion.morning.planned).toBe(60);
    expect(result.bandCompletion.evening.planned).toBe(0);
  });
});

describe("courses at risk", () => {
  it("flags work that cannot fit before its deadline", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [
        task({
          id: "tight",
          title: "Huge project",
          estimatedMinutes: 1800,
          deadline: "2026-08-12T15:00:00.000Z", // two days away
        }),
      ],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.coursesAtRisk).toHaveLength(1);
    expect(result.coursesAtRisk[0]?.taskTitle).toBe("Huge project");
    expect(result.coursesAtRisk[0]?.pressure).toBeGreaterThan(1);
  });

  it("leaves comfortable work alone", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [
        task({ estimatedMinutes: 120, deadline: "2026-09-30T15:00:00.000Z" }),
      ],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.coursesAtRisk).toHaveLength(0);
  });

  /**
   * The case that matters is a task finished *early* — marked done with time
   * still left on the estimate. Judging by remaining minutes alone would flag
   * it as at risk, which is the opposite of the truth.
   */
  it("ignores work marked finished, even with estimate left over", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [
        task({
          status: "completed",
          estimatedMinutes: 1800,
          completedMinutes: 500,
          deadline: "2026-08-11T15:00:00.000Z",
        }),
      ],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.coursesAtRisk).toHaveLength(0);
  });

  it("ignores cancelled work too", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [
        task({
          status: "cancelled",
          estimatedMinutes: 1800,
          completedMinutes: 0,
          deadline: "2026-08-11T15:00:00.000Z",
        }),
      ],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.coursesAtRisk).toHaveLength(0);
  });

  it("puts the most pressing first", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [
        task({ id: "a", title: "Less urgent", estimatedMinutes: 600, deadline: "2026-08-13T15:00:00.000Z" }),
        task({ id: "b", title: "More urgent", estimatedMinutes: 900, deadline: "2026-08-11T15:00:00.000Z" }),
      ],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.coursesAtRisk[0]?.taskTitle).toBe("More urgent");
  });
});

describe("workload before the next deadline", () => {
  it("counts only what remains, for the nearest deadline", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [
        task({ id: "soon", estimatedMinutes: 300, completedMinutes: 120, deadline: "2026-08-12T15:00:00.000Z" }),
        task({ id: "later", estimatedMinutes: 600, deadline: "2026-09-01T15:00:00.000Z" }),
      ],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.workloadBeforeNextDeadline.deadline).toBe("2026-08-12T15:00:00.000Z");
    expect(result.workloadBeforeNextDeadline.remainingMinutes).toBe(180);
  });

  it("reports nothing when every deadline has passed", () => {
    const result = computeInsights({
      sessions: [],
      tasks: [task({ deadline: "2026-01-01T15:00:00.000Z" })],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.workloadBeforeNextDeadline.deadline).toBeNull();
  });
});

describe("counts", () => {
  it("tallies completed, missed and rescheduled separately", () => {
    const result = computeInsights({
      sessions: [
        session({ status: "completed" }),
        session({ status: "missed", completedMinutes: 0 }),
        session({ status: "completed", wasRescheduled: true }),
      ],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });

    expect(result.completedCount).toBe(2);
    expect(result.missedCount).toBe(1);
    expect(result.rescheduledCount).toBe(1);
  });
});

describe("dailyTotals", () => {
  it("includes empty days rather than hiding gaps", () => {
    const result = dailyTotals({
      sessions: [session({ startAt: "2026-08-05T07:00:00.000Z", endAt: "2026-08-05T08:00:00.000Z" })],
      fromIso: "2026-08-04T00:00:00.000Z",
      toIso: "2026-08-06T00:00:00.000Z",
      timeZone: STOCKHOLM,
    });

    expect(result).toHaveLength(3);
    expect(result[0]?.completedMinutes).toBe(0);
    expect(result[1]?.completedMinutes).toBe(60);
    expect(result[2]?.completedMinutes).toBe(0);
  });
});
