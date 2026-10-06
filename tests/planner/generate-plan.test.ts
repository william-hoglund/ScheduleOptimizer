import { describe, expect, it } from "vitest";

import { generatePlan } from "@/lib/planner/generate-plan";
import { rescheduleMissedSessions } from "@/lib/planner/rescheduling/reschedule-missed-session";
import { epochMinutesToLocalDate, minutesIntoLocalDay } from "@/lib/planner/time-grid";
import {
  STOCKHOLM,
  existingSession,
  fixedEvent,
  hasOverlap,
  input,
  local,
  preferences,
  task,
} from "./helpers";

/**
 * The twelve guarantees the brief requires of the scheduling engine.
 *
 * These are behavioural: they assert what a student would notice, not how the
 * code happens to be written.
 */

describe("1. no overlapping study sessions", () => {
  it("never double-books, even under heavy load", () => {
    const result = generatePlan(
      input({
        tasks: [
          task({ id: "a", estimatedMinutes: 300, deadline: local("2026-08-07", "17:00") }),
          task({ id: "b", estimatedMinutes: 300, deadline: local("2026-08-06", "17:00") }),
          task({ id: "c", estimatedMinutes: 240, deadline: local("2026-08-05", "17:00") }),
        ],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
    expect(hasOverlap(result.sessions)).toBe(false);
  });
});

describe("2. no sessions during fixed calendar events", () => {
  it("schedules around a lecture", () => {
    const lecture = fixedEvent({
      start: local("2026-08-03", "08:00"),
      end: local("2026-08-03", "12:00"),
    });

    const result = generatePlan(
      input({
        fixedEvents: [lecture],
        horizonEndDate: "2026-08-03",
        tasks: [task({ estimatedMinutes: 120, deadline: local("2026-08-03", "20:00") })],
      }),
    );

    for (const session of result.sessions) {
      expect(session.start < lecture.end && lecture.start < session.end).toBe(false);
    }
  });

  it("ignores movable events, which are not obstacles", () => {
    const movable = fixedEvent({
      start: local("2026-08-03", "08:00"),
      end: local("2026-08-03", "20:00"),
      isFixed: false,
    });

    const result = generatePlan(
      input({
        fixedEvents: [movable],
        horizonEndDate: "2026-08-03",
        tasks: [task({ estimatedMinutes: 60, deadline: local("2026-08-03", "20:00") })],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
  });
});

describe("3. deadlines are respected", () => {
  /**
   * The deadline falls in the *middle* of an available window, which is the
   * case that actually exercises the per-slot check: 10:00 on Monday, inside a
   * window running 08:00–20:00, with a daily cap generous enough not to
   * interfere and far more work than two hours can hold.
   *
   * Without the constraint the engine fills Monday afternoon with work that is
   * already late.
   */
  it("stops at a deadline that falls inside an open window", () => {
    const deadline = local("2026-08-03", "10:00");

    const result = generatePlan(
      input({
        horizonEndDate: "2026-08-07",
        preferences: preferences({ maximumDailyMinutes: 600 }),
        tasks: [task({ estimatedMinutes: 600, deadline })],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
    for (const session of result.sessions) {
      expect(session.end).toBeLessThanOrEqual(deadline);
    }

    // And it must admit the work did not all fit, rather than silently dropping it.
    const coverage = result.taskCoverage[0];
    expect(coverage).toBeDefined();
    expect(coverage!.scheduledMinutes).toBeLessThan(coverage!.neededMinutes);
  });

  it("never places work after a task's deadline", () => {
    const deadline = local("2026-08-04", "12:00");

    const result = generatePlan(
      input({
        tasks: [task({ estimatedMinutes: 180, deadline })],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
    for (const session of result.sessions) {
      expect(session.end).toBeLessThanOrEqual(deadline);
    }
  });

  it("prefers the more urgent task when two compete", () => {
    const result = generatePlan(
      input({
        tasks: [
          task({ id: "far", estimatedMinutes: 120, deadline: local("2026-08-07", "17:00") }),
          task({ id: "soon", estimatedMinutes: 120, deadline: local("2026-08-03", "20:00") }),
        ],
        horizonEndDate: "2026-08-03",
        preferences: preferences({ maximumDailyMinutes: 120 }),
      }),
    );

    // Only two hours available on the single day; they must go to "soon".
    const scheduled = result.sessions.filter((s) => !s.preserved);
    expect(scheduled.every((session) => session.taskId === "soon")).toBe(true);
  });
});

describe("4. maximum study time per day is respected", () => {
  it("never exceeds the daily cap", () => {
    const cap = 120;

    const result = generatePlan(
      input({
        preferences: preferences({ maximumDailyMinutes: cap }),
        tasks: [task({ estimatedMinutes: 900, deadline: local("2026-08-07", "20:00") })],
      }),
    );

    const byDate = new Map<string, number>();
    for (const session of result.sessions) {
      const date = epochMinutesToLocalDate(session.start, STOCKHOLM);
      byDate.set(date, (byDate.get(date) ?? 0) + session.minutes);
    }

    for (const [, minutes] of byDate) {
      expect(minutes).toBeLessThanOrEqual(cap);
    }
  });
});

describe("5. locked sessions are not moved", () => {
  it("keeps a locked session exactly where it was", () => {
    const locked = existingSession({
      id: "locked-1",
      start: local("2026-08-04", "14:00"),
      end: local("2026-08-04", "15:30"),
      isLocked: true,
    });

    const result = generatePlan(
      input({
        existingSessions: [locked],
        tasks: [task({ estimatedMinutes: 300 })],
      }),
    );

    const kept = result.sessions.find((session) => session.start === locked.start);
    expect(kept).toBeDefined();
    expect(kept?.end).toBe(locked.end);
    expect(kept?.isLocked).toBe(true);
    expect(kept?.preserved).toBe(true);
  });

  it("does not schedule new work over a locked session", () => {
    const locked = existingSession({
      id: "locked-1",
      start: local("2026-08-03", "08:00"),
      end: local("2026-08-03", "12:00"),
      isLocked: true,
      taskId: null,
    });

    const result = generatePlan(
      input({
        existingSessions: [locked],
        horizonEndDate: "2026-08-03",
        tasks: [task({ estimatedMinutes: 240, deadline: local("2026-08-03", "20:00") })],
      }),
    );

    const fresh = result.sessions.filter((session) => !session.preserved);
    for (const session of fresh) {
      expect(session.start < locked.end && locked.start < session.end).toBe(false);
    }
  });
});

describe("6. missed sessions can be rescheduled", () => {
  it("re-places missed work while leaving the rest alone", () => {
    const missed = existingSession({
      id: "missed-1",
      start: local("2026-08-03", "09:00"),
      end: local("2026-08-03", "10:00"),
      status: "missed",
    });
    const untouched = existingSession({
      id: "keep-1",
      start: local("2026-08-05", "09:00"),
      end: local("2026-08-05", "10:00"),
      status: "planned",
    });

    const base = input({
      existingSessions: [missed, untouched],
      tasks: [task({ estimatedMinutes: 120, deadline: local("2026-08-07", "17:00") })],
    });

    const outcome = rescheduleMissedSessions(base, ["missed-1"]);

    // The surviving session is still exactly where it was.
    const kept = outcome.result.sessions.find((session) => session.start === untouched.start);
    expect(kept).toBeDefined();
    expect(kept?.end).toBe(untouched.end);

    // And the missed work found a new home.
    expect(outcome.added.length).toBeGreaterThan(0);
    expect(outcome.couldNotPlace).toBe(false);
    expect(hasOverlap(outcome.result.sessions)).toBe(false);
  });
});

describe("7. time zones work correctly", () => {
  it("keeps sessions inside the student's local study window", () => {
    const result = generatePlan(
      input({
        preferences: preferences({ earliestStartTime: "09:00", latestEndTime: "17:00" }),
        tasks: [task({ estimatedMinutes: 300, deadline: local("2026-08-07", "17:00") })],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
    for (const session of result.sessions) {
      const startMinutes = minutesIntoLocalDay(session.start, STOCKHOLM);
      const endMinutes = startMinutes + session.minutes;
      expect(startMinutes).toBeGreaterThanOrEqual(9 * 60);
      expect(endMinutes).toBeLessThanOrEqual(17 * 60);
    }
  });

  it("produces different absolute times for the same wall clock in another zone", () => {
    const stockholm = generatePlan(input({ timeZone: STOCKHOLM }));
    const newYork = generatePlan(input({ timeZone: "America/New_York" }));

    const first = stockholm.sessions[0];
    const second = newYork.sessions[0];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // 09:00 in Stockholm is not the same instant as 09:00 in New York.
    expect(first?.start).not.toBe(second?.start);
  });
});

describe("8. daylight saving is handled", () => {
  it("keeps the local study window correct across the autumn change", () => {
    // Sweden falls back on 2026-10-25 at 03:00 local.
    const result = generatePlan(
      input({
        now: local("2026-10-23", "06:00"),
        horizonStartDate: "2026-10-23",
        horizonEndDate: "2026-10-27",
        preferences: preferences({
          earliestStartTime: "09:00",
          latestEndTime: "17:00",
          preferredDays: [1, 2, 3, 4, 5, 6, 7],
          weekendAllowed: true,
        }),
        tasks: [
          task({ estimatedMinutes: 600, deadline: local("2026-10-27", "17:00") }),
        ],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);

    // Every session must still fall inside 09:00–17:00 *local*, on both sides
    // of the transition. A naive UTC-offset implementation shifts by an hour
    // here and this assertion fails.
    for (const session of result.sessions) {
      const startMinutes = minutesIntoLocalDay(session.start, STOCKHOLM);
      expect(startMinutes).toBeGreaterThanOrEqual(9 * 60);
      expect(startMinutes + session.minutes).toBeLessThanOrEqual(17 * 60);
    }

    // And work must actually be placed on both sides of the change.
    const dates = new Set(
      result.sessions.map((session) => epochMinutesToLocalDate(session.start, STOCKHOLM)),
    );
    expect([...dates].some((date) => date < "2026-10-25")).toBe(true);
    expect([...dates].some((date) => date > "2026-10-25")).toBe(true);
  });
});

describe("9. tasks are split correctly", () => {
  it("breaks a large task into several sessions rather than one block", () => {
    const result = generatePlan(
      input({
        tasks: [task({ estimatedMinutes: 300, deadline: local("2026-08-07", "17:00") })],
      }),
    );

    const sessions = result.sessions.filter((s) => !s.preserved);
    expect(sessions.length).toBeGreaterThan(1);
    for (const session of sessions) {
      expect(session.minutes).toBeLessThanOrEqual(120);
      expect(session.minutes).toBeGreaterThanOrEqual(30);
    }
  });

  it("gives reading and deep work different session shapes", () => {
    const readingPlan = generatePlan(
      input({
        // Method shapes apply when a task picks a method; without one, the
        // study style decides (see "study style" tests below).
        tasks: [task({ id: "r", taskType: "reading", estimatedMinutes: 300, preferredStudyMethod: "spaced_repetition" })],
      }),
    );
    const deepPlan = generatePlan(
      input({
        tasks: [task({ id: "d", taskType: "project", estimatedMinutes: 300, preferredStudyMethod: "deep_work" })],
      }),
    );

    const readingLength = readingPlan.sessions[0]?.minutes ?? 0;
    const deepLength = deepPlan.sessions[0]?.minutes ?? 0;

    // Project work gets longer blocks than reading.
    expect(deepLength).toBeGreaterThan(readingLength);
  });

  it("never leaves a stub shorter than the student's minimum", () => {
    const result = generatePlan(
      input({
        preferences: preferences({ minimumSessionMinutes: 45, preferredSessionMinutes: 60 }),
        tasks: [task({ estimatedMinutes: 190, deadline: local("2026-08-07", "17:00") })],
      }),
    );

    for (const session of result.sessions.filter((s) => !s.preserved)) {
      expect(session.minutes).toBeGreaterThanOrEqual(45);
    }
  });
});

describe("10. unrealistic workloads create warnings", () => {
  it("says so plainly, and offers concrete options", () => {
    const result = generatePlan(
      input({
        horizonEndDate: "2026-08-04",
        preferences: preferences({ maximumDailyMinutes: 120 }),
        tasks: [
          task({ id: "huge", estimatedMinutes: 1800, deadline: local("2026-08-04", "20:00") }),
        ],
      }),
    );

    expect(result.feasibility.feasible).toBe(false);
    expect(result.feasibility.shortfallMinutes).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.code === "not_enough_time")).toBe(true);
    expect(result.feasibility.remedies.length).toBeGreaterThan(0);
    expect(result.feasibility.atRiskTaskIds).toContain("huge");
  });

  it("reports how much time is needed versus available", () => {
    const result = generatePlan(
      input({
        horizonEndDate: "2026-08-04",
        tasks: [task({ estimatedMinutes: 3000 })],
      }),
    );

    expect(result.feasibility.requiredMinutes).toBe(3000);
    expect(result.feasibility.availableMinutes).toBeGreaterThan(0);
    expect(result.feasibility.requiredMinutes).toBeGreaterThan(
      result.feasibility.usableMinutes,
    );
  });

  it("is satisfied when the work genuinely fits", () => {
    const result = generatePlan(
      input({ tasks: [task({ estimatedMinutes: 120 })] }),
    );

    expect(result.feasibility.feasible).toBe(true);
    expect(result.warnings.some((w) => w.code === "not_enough_time")).toBe(false);
  });
});

describe("11. the same input and seed produce the same plan", () => {
  it("is deterministic across repeated runs", () => {
    const base = input({
      tasks: [
        task({ id: "a", estimatedMinutes: 300 }),
        task({ id: "b", estimatedMinutes: 240, deadline: local("2026-08-06", "17:00") }),
        task({ id: "c", estimatedMinutes: 180, taskType: "reading" }),
      ],
    });

    const first = generatePlan(base);
    const second = generatePlan(base);

    expect(JSON.stringify(first.sessions)).toBe(JSON.stringify(second.sessions));
  });

  it("does not depend on the order tasks arrive in", () => {
    const tasks = [
      task({ id: "a", estimatedMinutes: 180 }),
      task({ id: "b", estimatedMinutes: 180, deadline: local("2026-08-06", "17:00") }),
    ];

    const forward = generatePlan(input({ tasks }));
    const reversed = generatePlan(input({ tasks: [...tasks].reverse() }));

    expect(JSON.stringify(forward.sessions)).toBe(JSON.stringify(reversed.sessions));
  });

  /**
   * The seed has to actually do something: the planner offers a "show me an
   * alternative" option, which is just the same input with a different seed. A
   * seed that never changes the outcome cannot deliver that.
   */
  it("produces genuinely different plans for different seeds", () => {
    const plans = ["a", "b", "c", "d", "e"].map((seed) =>
      generatePlan(
        input({
          seed,
          tasks: [task({ estimatedMinutes: 300, deadline: local("2026-08-07", "17:00") })],
        }),
      ),
    );

    const shapes = new Set(plans.map((plan) => JSON.stringify(plan.sessions)));
    expect(shapes.size).toBeGreaterThan(1);

    // Every alternative must still be a legal plan, not just a different one.
    for (const plan of plans) {
      expect(plan.sessions.length).toBeGreaterThan(0);
      expect(hasOverlap(plan.sessions)).toBe(false);
    }
  });
});

describe("bonus: study days and weekends are respected", () => {
  it("leaves weekends alone unless the student opts in", () => {
    const result = generatePlan(
      input({
        horizonStartDate: "2026-08-08", // Saturday
        horizonEndDate: "2026-08-09", // Sunday
        now: local("2026-08-07", "20:00"),
        preferences: preferences({ weekendAllowed: false }),
        tasks: [task({ estimatedMinutes: 240, deadline: local("2026-08-09", "20:00") })],
      }),
    );

    expect(result.sessions.filter((s) => !s.preserved)).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "no_availability")).toBe(true);
  });

  it("uses the weekend once allowed", () => {
    const result = generatePlan(
      input({
        horizonStartDate: "2026-08-08",
        horizonEndDate: "2026-08-09",
        now: local("2026-08-07", "20:00"),
        preferences: preferences({
          weekendAllowed: true,
          preferredDays: [1, 2, 3, 4, 5, 6, 7],
        }),
        tasks: [task({ estimatedMinutes: 240, deadline: local("2026-08-09", "20:00") })],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
  });

  it("skips days the student excluded", () => {
    const result = generatePlan(
      input({
        // Mondays and Wednesdays only.
        preferences: preferences({ preferredDays: [1, 3] }),
        tasks: [task({ estimatedMinutes: 600, deadline: local("2026-08-07", "17:00") })],
      }),
    );

    const weekdays = new Set(
      result.sessions.map((session) =>
        new Date(`${epochMinutesToLocalDate(session.start, STOCKHOLM)}T00:00:00Z`).getUTCDay(),
      ),
    );

    // 1 = Monday, 3 = Wednesday.
    for (const day of weekdays) {
      expect([1, 3]).toContain(day);
    }
  });
});

describe("12. manual changes are preserved", () => {
  it("keeps a session the student moved themselves", () => {
    const moved = existingSession({
      id: "moved-1",
      start: local("2026-08-06", "18:30"),
      end: local("2026-08-06", "19:30"),
      manuallyModified: true,
    });

    const result = generatePlan(
      input({
        existingSessions: [moved],
        tasks: [task({ estimatedMinutes: 300 })],
      }),
    );

    const kept = result.sessions.find((session) => session.start === moved.start);
    expect(kept).toBeDefined();
    expect(kept?.preserved).toBe(true);
    expect(kept?.reason.code).toBe("preserved_manual");
  });

  it("keeps completed work untouched, even outside the study window", () => {
    const done = existingSession({
      id: "done-1",
      start: local("2026-08-03", "05:00"),
      end: local("2026-08-03", "06:00"),
      status: "completed",
      completedMinutes: 60,
    });

    const result = generatePlan(
      input({ existingSessions: [done], tasks: [task({ estimatedMinutes: 120 })] }),
    );

    const kept = result.sessions.find((session) => session.start === done.start);
    expect(kept).toBeDefined();
    expect(kept?.reason.code).toBe("preserved_completed");
    // Preserved history must not be reported as a conflict.
    expect(result.warnings.some((w) => w.severity === "critical")).toBe(false);
  });

  it("re-places an ordinary planned session, which is not a manual decision", () => {
    const ordinary = existingSession({
      id: "plain-1",
      start: local("2026-08-06", "18:30"),
      end: local("2026-08-06", "19:30"),
      status: "planned",
      isLocked: false,
      manuallyModified: false,
    });

    const result = generatePlan(
      input({ existingSessions: [ordinary], tasks: [task({ estimatedMinutes: 120 })] }),
    );

    expect(result.sessions.some((session) => session.preserved)).toBe(false);
  });
});
