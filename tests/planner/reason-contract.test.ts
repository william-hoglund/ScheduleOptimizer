import { describe, expect, it } from "vitest";

import { generatePlan } from "@/lib/planner/generate-plan";
import type { SessionReason } from "@/lib/planner/types";
import { existingSession, input, local, preferences, task } from "./helpers";

/**
 * The contract between a session's reason and the sentence that renders it.
 *
 * Each reason code maps to an ICU message with named placeholders. If the
 * engine emits a code without the values its message needs, next-intl throws at
 * render time and the student sees a raw key like
 * `planner.reasons.deadline_pressure` on screen.
 *
 * That happened: `deadline_pressure` was returned for tasks with no deadline,
 * where there is no "days left" to report. Types cannot catch it — `details` is
 * an open record — so it is pinned here instead.
 *
 * **Adding a placeholder to a message means adding it below.**
 */

const REQUIRED_DETAILS: Record<SessionReason["code"], readonly string[]> = {
  deadline_pressure: ["daysLeft"],
  high_energy_match: ["hour"],
  spaced_repetition: ["parts"],
  preferred_time: [],
  spread_before_deadline: [],
  first_available: [],
  preserved_locked: [],
  preserved_manual: [],
  preserved_completed: [],
};

function assertReasonIsRenderable(reason: SessionReason) {
  const required = REQUIRED_DETAILS[reason.code];
  expect(required, `unknown reason code "${reason.code}"`).toBeDefined();

  for (const key of required) {
    expect(
      reason.details?.[key],
      `reason "${reason.code}" is missing "${key}", which its message needs`,
    ).toBeDefined();
  }
}

describe("every reason carries what its message needs", () => {
  it("for a mix of dated and undated work", () => {
    const result = generatePlan(
      input({
        horizonEndDate: "2026-08-07",
        tasks: [
          task({ id: "dated", estimatedMinutes: 240, deadline: local("2026-08-05", "17:00") }),
          // The case that broke: no deadline at all.
          task({ id: "undated", estimatedMinutes: 180, deadline: null }),
          task({
            id: "far",
            estimatedMinutes: 120,
            taskType: "reading",
            deadline: local("2026-09-30", "17:00"),
          }),
        ],
      }),
    );

    expect(result.sessions.length).toBeGreaterThan(0);
    for (const session of result.sessions) {
      assertReasonIsRenderable(session.reason);
    }
  });

  it("for preserved sessions", () => {
    const result = generatePlan(
      input({
        existingSessions: [
          existingSession({ id: "a", isLocked: true }),
          existingSession({
            id: "b",
            start: local("2026-08-04", "09:00"),
            end: local("2026-08-04", "10:00"),
            manuallyModified: true,
          }),
          existingSession({
            id: "c",
            start: local("2026-08-05", "09:00"),
            end: local("2026-08-05", "10:00"),
            status: "completed",
          }),
        ],
        tasks: [task({ estimatedMinutes: 120 })],
      }),
    );

    for (const session of result.sessions) {
      assertReasonIsRenderable(session.reason);
    }
  });

  it("under a variety of energy profiles and session shapes", () => {
    const profiles = [
      { morning: "high", afternoon: "medium", evening: "low" },
      { morning: "low", afternoon: "high", evening: "medium" },
      { morning: "low", afternoon: "low", evening: "high" },
    ] as const;

    for (const energyProfile of profiles) {
      const result = generatePlan(
        input({
          preferences: preferences({ energyProfile, latestEndTime: "22:00" }),
          tasks: [
            task({ id: "x", estimatedMinutes: 300, taskType: "revision", deadline: null }),
            task({ id: "y", estimatedMinutes: 200, taskType: "exam" }),
          ],
        }),
      );

      for (const session of result.sessions) {
        assertReasonIsRenderable(session.reason);
      }
    }
  });

  it("never emits a code the message file does not define", () => {
    const result = generatePlan(
      input({ tasks: [task({ estimatedMinutes: 300, deadline: null })] }),
    );

    const known = new Set(Object.keys(REQUIRED_DETAILS));
    for (const session of result.sessions) {
      expect(known.has(session.reason.code)).toBe(true);
    }
  });
});
