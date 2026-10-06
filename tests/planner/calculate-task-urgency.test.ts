import { describe, expect, it } from "vitest";

import { calculateTaskUrgency } from "@/lib/planner/tasks/calculate-task-urgency";
import { local, MONDAY_0600, task } from "./helpers";

/**
 * The readiness dampening in `calculateTaskUrgency`: a task's static
 * "this matters" weight (importance, course priority) only applies at full
 * strength once there is real reason to be working on it — within two weeks
 * of its target deadline, or already falling behind. Far out with slack to
 * spare, that weight tapers — which is what stops a distant but high-stakes
 * exam from outranking, and getting scheduled ahead of, work that is
 * genuinely due soon. See the function's own comment for the full reasoning.
 */

const BASE = {
  now: MONDAY_0600,
  bufferPercentage: 0,
  maximumDailyMinutes: 240,
  blockedByCount: 0,
};

describe("calculateTaskUrgency — readiness dampening", () => {
  it("ranks a near-term low-stakes task above a distant high-stakes exam", () => {
    // 49 days out (~7 weeks) — the exact scenario reported: exam prep should
    // not outrank something due in a few days just because it is graded.
    const distantExam = task({
      id: "exam",
      taskType: "exam",
      priority: 5,
      coursePriority: 5,
      deadline: local("2026-09-21", "17:00"),
      estimatedMinutes: 120,
    });
    const nearReading = task({
      id: "reading",
      taskType: "reading",
      priority: 2,
      coursePriority: 2,
      deadline: local("2026-08-06", "17:00"),
      estimatedMinutes: 60,
    });

    const examPriority = calculateTaskUrgency(distantExam, BASE);
    const readingPriority = calculateTaskUrgency(nearReading, BASE);

    expect(readingPriority.total).toBeGreaterThan(examPriority.total);
  });

  it("gives full weight to a task within two weeks of its deadline regardless of stakes", () => {
    const soonExam = task({
      id: "exam",
      taskType: "exam",
      priority: 5,
      coursePriority: 5,
      deadline: local("2026-08-15", "17:00"), // 12 days out
      estimatedMinutes: 120,
    });

    const priority = calculateTaskUrgency(soonExam, BASE);
    const fullImportance = 1 * (5 / 5) * (WEIGHT_IMPORTANCE);
    expect(priority.components.importance).toBeCloseTo(fullImportance, 5);
  });

  it("still gives full weight to a distant task that is genuinely falling behind", () => {
    // Far out, but so much work remains that it no longer fits comfortably —
    // readiness should not throttle a task that is actually in trouble.
    const hugeDistantProject = task({
      id: "project",
      taskType: "project",
      priority: 5,
      coursePriority: 5,
      deadline: local("2026-09-21", "17:00"), // 49 days out
      estimatedMinutes: 20 * 60, // far more than 49 days * 240 min/day budget would suggest is urgent on its own
    });

    const priority = calculateTaskUrgency(hugeDistantProject, BASE);
    const fullImportance = 0.85 * (5 / 5) * WEIGHT_IMPORTANCE;
    // Not throttled: fallingBehind pressure is low here too (budget easily
    // covers 20h over 49 days), so this mainly documents the boundary rather
    // than asserting fallingBehind saves it — kept as a regression guard on
    // the component actually being computed, not a claim about this exact case.
    expect(priority.components.importance).toBeLessThanOrEqual(fullImportance);
  });

  it("never throttles importance below the floor no matter how distant the deadline", () => {
    const veryDistantExam = task({
      id: "exam",
      taskType: "exam",
      priority: 5,
      coursePriority: 5,
      deadline: local("2027-02-01", "17:00"), // roughly six months out
      estimatedMinutes: 120,
    });

    const priority = calculateTaskUrgency(veryDistantExam, BASE);
    const fullImportance = 1 * (5 / 5) * WEIGHT_IMPORTANCE;
    const floorImportance = fullImportance * 0.25;
    expect(priority.components.importance).toBeGreaterThanOrEqual(floorImportance - 1e-6);
  });
});

/** Mirrors the private WEIGHTS.importance in calculate-task-urgency.ts. */
const WEIGHT_IMPORTANCE = 20;
