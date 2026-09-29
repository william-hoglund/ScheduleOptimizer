import { describe, expect, it } from "vitest";

import { computeWhatIf } from "@/lib/intelligence/what-if";
import { MONDAY_0600, STOCKHOLM, preferences, task } from "../planner/helpers";

// Monday 2026-08-03 through Sunday 2026-08-09 — a full week, preferredDays
// Mon-Fri (1-5), 08:00-20:00 local (12h/day). 5 * 720 = 3600 minutes free,
// none of it in the past relative to MONDAY_0600 (06:00 local Monday).
const HORIZON_START = "2026-08-03";
const HORIZON_END = "2026-08-09";
const HORIZON_END_EPOCH = MONDAY_0600 + 7 * 1440;

function baseInput(overrides: Partial<Parameters<typeof computeWhatIf>[0]> = {}) {
  return {
    scenario: { kind: "skip_day" as const, dayOfWeek: 1 as const },
    horizonDays: 7 as const,
    tasks: [task({ estimatedMinutes: 60, deadline: HORIZON_END_EPOCH })],
    preferences: preferences(),
    availabilityRules: [],
    fixedEvents: [],
    calendarSources: [],
    timeZone: STOCKHOLM,
    horizonStartDate: HORIZON_START,
    horizonEndDate: HORIZON_END,
    now: MONDAY_0600,
    horizonEnd: HORIZON_END_EPOCH,
    courseNameById: new Map<string, string>(),
    ...overrides,
  };
}

describe("computeWhatIf — skip_day", () => {
  it("removes exactly one day's worth of availability from the projection", () => {
    const { current, projected } = computeWhatIf(baseInput({ scenario: { kind: "skip_day", dayOfWeek: 1 } }));

    expect(current.availableMinutes).toBe(3600);
    expect(projected.availableMinutes).toBe(3600 - 720);
  });

  it("removing a day the student never studied anyway changes nothing", () => {
    // Saturday (6) is not in the default preferredDays [1..5] to begin with.
    const { current, projected } = computeWhatIf(baseInput({ scenario: { kind: "skip_day", dayOfWeek: 6 } }));
    expect(projected.availableMinutes).toBe(current.availableMinutes);
  });

  it("leaves current untouched — only projected reflects the scenario", () => {
    const { current, projected } = computeWhatIf(baseInput({ scenario: { kind: "skip_day", dayOfWeek: 1 } }));
    expect(current.requiredMinutes).toBe(projected.requiredMinutes);
    expect(current.availableMinutes).not.toBe(projected.availableMinutes);
  });
});

describe("computeWhatIf — extra_commitment", () => {
  it("reduces available minutes by exactly hours * 60", () => {
    const { current, projected } = computeWhatIf(
      baseInput({ scenario: { kind: "extra_commitment", hours: 5 } }),
    );
    expect(projected.availableMinutes).toBe(current.availableMinutes - 5 * 60);
  });

  it("floors at zero rather than going negative", () => {
    const { projected } = computeWhatIf(baseInput({ scenario: { kind: "extra_commitment", hours: 1000 } }));
    expect(projected.availableMinutes).toBe(0);
  });
});
