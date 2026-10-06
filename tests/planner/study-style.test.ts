import { describe, expect, it } from "vitest";

import { generatePlan, joinAdjacentSessions } from "@/lib/planner/generate-plan";
import { splitTaskIntoSessions } from "@/lib/planner/tasks/split-task-into-sessions";
import type { PlannedSession } from "@/lib/planner/types";
import { input, local, preferences, task } from "./helpers";

const work = task({ estimatedMinutes: 480, difficulty: 3, preferredStudyMethod: null });

describe("study style sets block length", () => {
  it("'my own way' follows the preferred session length (90 by default)", () => {
    const chunks = splitTaskIntoSessions(work, 480, preferences({ breakMethod: "none", preferredSessionMinutes: 90, maximumSessionMinutes: 180 }));
    expect(chunks[0]?.minutes).toBe(90);
  });

  it("Pomodoro styles plan two-hour blocks the timer splits into rounds", () => {
    for (const breakMethod of ["pomodoro", "fifty_ten"] as const) {
      const chunks = splitTaskIntoSessions(work, 480, preferences({ breakMethod, maximumSessionMinutes: 180 }));
      expect(chunks[0]?.minutes).toBe(120);
    }
  });

  it("deep work plans the longest blocks", () => {
    const chunks = splitTaskIntoSessions(work, 480, preferences({ breakMethod: "ninety_twenty", maximumSessionMinutes: 180 }));
    expect(chunks[0]?.minutes).toBe(150);
  });

  it("an explicit task method still wins over the style", () => {
    const recall = task({ estimatedMinutes: 480, preferredStudyMethod: "active_recall" });
    const chunks = splitTaskIntoSessions(recall, 480, preferences({ breakMethod: "ninety_twenty" }));
    expect(chunks[0]?.minutes).toBeLessThanOrEqual(45);
  });
});

const session = (start: number, end: number, overrides: Partial<PlannedSession> = {}): PlannedSession => ({
  taskId: "t",
  courseId: null,
  title: "T",
  start,
  end,
  minutes: end - start,
  method: "deep_work",
  reason: { code: "first_available" } as unknown as PlannedSession["reason"],
  preserved: false,
  isLocked: false,
  ...overrides,
});

describe("joining back-to-back sessions", () => {
  const window = [{ start: 0, end: 1000 }];

  it("joins same-task sessions with a short free gap into one block", () => {
    const joined = joinAdjacentSessions([session(0, 40), session(45, 85), session(90, 130)], window);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ start: 0, end: 130, minutes: 120 });
  });

  it("keeps them apart when something else sits in the gap, the gap is long, or tasks differ", () => {
    const busyGap = [{ start: 0, end: 40 }, { start: 45, end: 1000 }];
    expect(joinAdjacentSessions([session(0, 40), session(45, 85)], busyGap)).toHaveLength(2);
    expect(joinAdjacentSessions([session(0, 40), session(70, 110)], window)).toHaveLength(2);
    expect(joinAdjacentSessions([session(0, 40), session(45, 85, { taskId: "other" })], window)).toHaveLength(2);
  });

  it("never grows a block past three hours, and leaves locked/preserved sessions alone", () => {
    expect(joinAdjacentSessions([session(0, 120), session(125, 245)], window)).toHaveLength(2);
    expect(joinAdjacentSessions([session(0, 40, { isLocked: true }), session(45, 85)], window)).toHaveLength(2);
  });

  it("a real plan has no back-to-back fragments of the same task", () => {
    const result = generatePlan(
      input({
        preferences: preferences({ breakMethod: "none", preferredSessionMinutes: 40, maximumSessionMinutes: 180 }),
        tasks: [task({ id: "a", estimatedMinutes: 240, deadline: local("2026-08-04", "20:00") })],
      }),
    );
    const sorted = [...result.sessions].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]!.start - sorted[i - 1]!.end;
      if (sorted[i]!.taskId === sorted[i - 1]!.taskId && sorted[i]!.phase === sorted[i - 1]!.phase) expect(gap > 15 || sorted[i]!.end - sorted[i - 1]!.start > 180).toBe(true);
    }
  });
});
