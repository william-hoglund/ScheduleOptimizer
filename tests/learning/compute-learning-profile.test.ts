import { describe, expect, it } from "vitest";

import {
  computeLearningProfile,
  type LearningSession,
  type LearningTask,
} from "@/lib/learning/compute-learning-profile";

const STOCKHOLM = "Europe/Stockholm";
const NOW = "2026-08-10T12:00:00.000Z"; // Monday 14:00 local

function session(overrides: Partial<LearningSession> = {}): LearningSession {
  return {
    courseId: "course-1",
    status: "completed",
    startAt: "2026-08-05T07:00:00.000Z", // 09:00 local — morning
    endAt: "2026-08-05T08:00:00.000Z",
    wasRescheduled: false,
    ...overrides,
  };
}

function task(overrides: Partial<LearningTask> = {}): LearningTask {
  return {
    courseId: "course-1",
    estimatedMinutes: 120,
    completedMinutes: 120,
    status: "completed",
    ...overrides,
  };
}

function morningSessions(count: number, overrides: Partial<LearningSession> = {}): LearningSession[] {
  return Array.from({ length: count }, () => session(overrides));
}

describe("computeLearningProfile — best study band", () => {
  it("reports nothing below the minimum sample size", () => {
    const insights = computeLearningProfile({
      sessions: morningSessions(5),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    expect(insights.find((i) => i.type === "best_study_band")).toBeUndefined();
  });

  it("reports the band once the minimum is reached", () => {
    const insights = computeLearningProfile({
      sessions: morningSessions(6),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    const found = insights.find((i) => i.type === "best_study_band");
    expect(found).toMatchObject({ value: { band: "morning" }, observationCount: 6, confidence: "low" });
  });

  it("never counts a future session against or for the pattern", () => {
    const future = session({ startAt: "2026-09-01T07:00:00.000Z", endAt: "2026-09-01T08:00:00.000Z" });
    const insights = computeLearningProfile({
      sessions: [...morningSessions(5), future],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    // Only 5 past sessions — still below the threshold, even though there are
    // 6 rows total.
    expect(insights.find((i) => i.type === "best_study_band")).toBeUndefined();
  });

  it("raises confidence as the sample grows", () => {
    const low = computeLearningProfile({
      sessions: morningSessions(6),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    }).find((i) => i.type === "best_study_band");
    const medium = computeLearningProfile({
      sessions: morningSessions(12),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    }).find((i) => i.type === "best_study_band");
    const high = computeLearningProfile({
      sessions: morningSessions(24),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    }).find((i) => i.type === "best_study_band");

    expect(low?.confidence).toBe("low");
    expect(medium?.confidence).toBe("medium");
    expect(high?.confidence).toBe("high");
  });
});

describe("computeLearningProfile — estimation bias", () => {
  function tasksWithRatio(count: number, ratio: number): LearningTask[] {
    return Array.from({ length: count }, () =>
      task({ estimatedMinutes: 100, completedMinutes: Math.round(100 * ratio) }),
    );
  }

  it("reports nothing below the minimum sample size", () => {
    const insights = computeLearningProfile({
      sessions: [],
      tasks: tasksWithRatio(4, 1.3),
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    expect(insights.find((i) => i.type === "estimation_bias")).toBeUndefined();
  });

  it("calls it accurate inside the +/-15% band", () => {
    const insights = computeLearningProfile({
      sessions: [],
      tasks: tasksWithRatio(5, 1.0),
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    const found = insights.find((i) => i.type === "estimation_bias");
    expect(found).toMatchObject({ value: { direction: "accurate" } });
  });

  it("calls it underestimating just past the upper boundary", () => {
    const insights = computeLearningProfile({
      sessions: [],
      tasks: tasksWithRatio(5, 1.16),
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    const found = insights.find((i) => i.type === "estimation_bias");
    expect(found).toMatchObject({ value: { direction: "underestimates" } });
  });

  it("calls it overestimating just past the lower boundary", () => {
    const insights = computeLearningProfile({
      sessions: [],
      tasks: tasksWithRatio(5, 0.84),
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    const found = insights.find((i) => i.type === "estimation_bias");
    expect(found).toMatchObject({ value: { direction: "overestimates" } });
  });

  it("clamps one wildly mis-logged task instead of letting it dominate the average", () => {
    // Four tasks estimated accurately, one logged at 50x its estimate.
    const outlier = task({ estimatedMinutes: 10, completedMinutes: 500 });
    const insights = computeLearningProfile({
      sessions: [],
      tasks: [...tasksWithRatio(4, 1.0), outlier],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    const found = insights.find((i) => i.type === "estimation_bias");
    // Without clamping, the outlier's raw ratio (50) would swamp the average
    // and this would read "underestimates" by a huge margin.
    expect(found?.value).toMatchObject({ direction: "underestimates" });
    if (found?.type === "estimation_bias") {
      expect(found.value.ratioPercent).toBeLessThan(100);
    }
  });

  it("only counts completed tasks with a real estimate", () => {
    const insights = computeLearningProfile({
      sessions: [],
      tasks: [
        ...tasksWithRatio(3, 1.3),
        task({ status: "in_progress" }),
        task({ estimatedMinutes: 0, completedMinutes: 0 }),
      ],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    // Only 3 of the 5 tasks qualify — still below the minimum of 5.
    expect(insights.find((i) => i.type === "estimation_bias")).toBeUndefined();
  });
});

describe("computeLearningProfile — course postponement risk", () => {
  function courseSessions(courseId: string, total: number, rescheduled: number): LearningSession[] {
    return Array.from({ length: total }, (_, index) =>
      session({ courseId, wasRescheduled: index < rescheduled }),
    );
  }

  it("does not flag a course below the minimum session count", () => {
    const insights = computeLearningProfile({
      sessions: courseSessions("course-1", 7, 5),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    expect(insights.find((i) => i.type === "course_postponement_risk")).toBeUndefined();
  });

  it("does not flag a course below the minimum rescheduled count, even at a high rate", () => {
    // 2 of 8 is 25% — below the rate threshold anyway, but also below the
    // absolute minimum of 3 rescheduled sessions.
    const insights = computeLearningProfile({
      sessions: courseSessions("course-1", 8, 2),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    expect(insights.find((i) => i.type === "course_postponement_risk")).toBeUndefined();
  });

  it("does not flag a course right at the 30% rate boundary", () => {
    // 3 of 10 is exactly 30% — the threshold is exclusive ("> 30%").
    const insights = computeLearningProfile({
      sessions: courseSessions("course-1", 10, 3),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    expect(insights.find((i) => i.type === "course_postponement_risk")).toBeUndefined();
  });

  it("flags a course just past every threshold", () => {
    // 4 of 10 is 40% — past the rate threshold, the count threshold, and the
    // session-count threshold all at once.
    const insights = computeLearningProfile({
      sessions: courseSessions("course-1", 10, 4),
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    const found = insights.find((i) => i.type === "course_postponement_risk");
    expect(found).toMatchObject({ courseId: "course-1", value: { riskLevel: "elevated" } });
  });

  it("evaluates each course independently — one busy course must not flag a calm one", () => {
    const insights = computeLearningProfile({
      sessions: [...courseSessions("course-1", 10, 4), ...courseSessions("course-2", 10, 0)],
      tasks: [],
      nowIso: NOW,
      timeZone: STOCKHOLM,
    });
    const flagged = insights.filter((i) => i.type === "course_postponement_risk");
    expect(flagged.map((i) => i.courseId)).toEqual(["course-1"]);
  });
});
