import { describe, expect, it } from "vitest";

import { generatePlan } from "@/lib/planner/generate-plan";
import { epochMinutesToLocalDate, minutesIntoLocalDay } from "@/lib/planner/time-grid";
import { STOCKHOLM, fixedEvent, hasOverlap, input, local, preferences, task } from "./helpers";

/**
 * A whole realistic week, end to end.
 *
 * The guarantee tests prove the engine obeys its rules. This one asks a
 * different question: given a normal student's week, is the plan any *good*?
 * Rules can all be satisfied by a schedule no human would accept.
 */

function realisticWeek() {
  return input({
    horizonStartDate: "2026-08-03",
    horizonEndDate: "2026-08-07",
    preferences: preferences({
      minimumSessionMinutes: 30,
      preferredSessionMinutes: 60,
      maximumSessionMinutes: 120,
      maximumDailyMinutes: 300,
      earliestStartTime: "08:00",
      latestEndTime: "20:00",
      bufferPercentage: 15,
      energyProfile: { morning: "high", afternoon: "medium", evening: "low" },
    }),
    fixedEvents: [
      // Monday and Wednesday statistics lectures.
      fixedEvent({
        id: "lec-1",
        start: local("2026-08-03", "09:00"),
        end: local("2026-08-03", "11:00"),
        courseId: "stats",
      }),
      fixedEvent({
        id: "lec-2",
        start: local("2026-08-05", "09:00"),
        end: local("2026-08-05", "11:00"),
        courseId: "stats",
      }),
      // Thursday databases lab.
      fixedEvent({
        id: "lab-1",
        start: local("2026-08-06", "13:00"),
        end: local("2026-08-06", "16:00"),
        courseId: "db",
      }),
    ],
    tasks: [
      task({
        id: "stats-exam",
        courseId: "stats",
        title: "Statistics exam",
        taskType: "exam",
        deadline: local("2026-08-07", "09:00"),
        estimatedMinutes: 300,
        difficulty: 5,
        priority: 5,
        coursePriority: 5,
      }),
      task({
        id: "db-assignment",
        courseId: "db",
        title: "Databases assignment 3",
        taskType: "assignment",
        deadline: local("2026-08-06", "17:00"),
        estimatedMinutes: 240,
        difficulty: 3,
        priority: 4,
        coursePriority: 3,
      }),
      task({
        id: "reading",
        courseId: "stats",
        title: "Read chapters 8–10",
        taskType: "reading",
        deadline: local("2026-08-07", "09:00"),
        estimatedMinutes: 120,
        difficulty: 2,
        priority: 2,
        coursePriority: 5,
      }),
    ],
  });
}

describe("a realistic week", () => {
  const result = generatePlan(realisticWeek());

  it("produces a legal plan", () => {
    expect(hasOverlap(result.sessions)).toBe(false);
    expect(result.warnings.some((w) => w.severity === "critical")).toBe(false);
  });

  it("fits the work into the week", () => {
    expect(result.feasibility.feasible).toBe(true);
    expect(result.quality.coverage).toBeGreaterThan(0.9);
  });

  it("spreads work across the week rather than cramming", () => {
    expect(result.quality.activeDays).toBeGreaterThanOrEqual(3);
    // No dead stretch in the middle of a working week.
    expect(result.quality.longestGapDays).toBeLessThanOrEqual(2);
  });

  it("never schedules into the evening", () => {
    for (const session of result.sessions) {
      const end = minutesIntoLocalDay(session.start, STOCKHOLM) + session.minutes;
      expect(end).toBeLessThanOrEqual(20 * 60);
    }
  });

  it("gives the hardest subject its share of high-energy mornings", () => {
    const statsSessions = result.sessions.filter((s) => s.courseId === "stats");
    const mornings = statsSessions.filter(
      (s) => minutesIntoLocalDay(s.start, STOCKHOLM) < 12 * 60,
    );

    expect(statsSessions.length).toBeGreaterThan(0);
    expect(mornings.length).toBeGreaterThan(0);
  });

  it("finishes each task before its own deadline", () => {
    const deadlines = new Map([
      ["stats-exam", local("2026-08-07", "09:00")],
      ["db-assignment", local("2026-08-06", "17:00")],
      ["reading", local("2026-08-07", "09:00")],
    ]);

    for (const session of result.sessions) {
      const deadline = session.taskId ? deadlines.get(session.taskId) : undefined;
      if (deadline) expect(session.end).toBeLessThanOrEqual(deadline);
    }
  });

  it("explains every session it placed", () => {
    for (const session of result.sessions.filter((s) => !s.preserved)) {
      expect(session.reason.code).toBeTruthy();
    }
  });

  it("respects the daily ceiling every single day", () => {
    const byDate = new Map<string, number>();
    for (const session of result.sessions) {
      const date = epochMinutesToLocalDate(session.start, STOCKHOLM);
      byDate.set(date, (byDate.get(date) ?? 0) + session.minutes);
    }
    for (const [, minutes] of byDate) {
      expect(minutes).toBeLessThanOrEqual(300);
    }
  });

  it("keeps sessions a sensible length", () => {
    for (const session of result.sessions.filter((s) => !s.preserved)) {
      expect(session.minutes).toBeGreaterThanOrEqual(30);
      expect(session.minutes).toBeLessThanOrEqual(120);
    }
  });

  /**
   * Without pacing, the deadline term front-loads everything into the first
   * days and leaves the run-up to the exam empty. Legal, but not a plan anyone
   * would keep — so the shape of the week is asserted, not just its legality.
   */
  it("paces the work rather than cramming it into the first days", () => {
    const byDate = new Map<string, number>();
    for (const session of result.sessions) {
      const date = epochMinutesToLocalDate(session.start, STOCKHOLM);
      byDate.set(date, (byDate.get(date) ?? 0) + session.minutes);
    }

    const loads = [...byDate.values()];
    const heaviest = Math.max(...loads);
    const total = loads.reduce((sum, value) => sum + value, 0);

    // No single day may swallow more than half the week's work.
    expect(heaviest / total).toBeLessThan(0.5);
    expect(byDate.size).toBeGreaterThanOrEqual(4);
  });
});
