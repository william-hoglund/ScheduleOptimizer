import { describe, expect, it } from "vitest";

import { applyDayEffects, capacityWithDayCaps } from "@/lib/planner/availability/apply-day-effects";
import { buildAvailability } from "@/lib/planner/availability/build-availability";
import { generatePlan } from "@/lib/planner/generate-plan";
import { epochMinutesToLocalDate, toEpochMinutes } from "@/lib/planner/time-grid";
import type { PlannerCalendarSource } from "@/lib/planner/types";
import { fixedEvent, input, local, preferences, STOCKHOLM, task } from "./helpers";

/**
 * What a working day costs the rest of the day.
 *
 * The rule these tests exist to pin down: an eight-hour day at the office ends
 * studying for that day, and a 45-minute stand-up does not. Everything else
 * here is a consequence of that distinction.
 */

const WORK = "source-work";
const UNIVERSITY = "source-university";

function workCalendar(overrides: Partial<PlannerCalendarSource> = {}): PlannerCalendarSource {
  return {
    id: WORK,
    dayEffect: "block",
    thresholdMinutes: 360,
    reducedDailyMinutes: 30,
    ...overrides,
  };
}

/** Local dates that carry at least one session. */
function daysWithSessions(sessions: readonly { start: number }[]): string[] {
  return [...new Set(sessions.map((s) => epochMinutesToLocalDate(s.start, STOCKHOLM)))].sort();
}

describe("applyDayEffects", () => {
  it("ignores a short meeting — it is an ordinary hole in the day", () => {
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "standup",
          sourceId: WORK,
          start: local("2026-08-04", "09:00"),
          end: local("2026-08-04", "09:45"),
        }),
      ],
      calendarSources: [workCalendar()],
      timeZone: STOCKHOLM,
    });

    expect(outcome.blockedDates.size).toBe(0);
    expect(outcome.capByDate.size).toBe(0);
  });

  it("takes the day once the working day passes the threshold", () => {
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "office",
          sourceId: WORK,
          start: local("2026-08-04", "09:00"),
          end: local("2026-08-04", "17:00"),
        }),
      ],
      calendarSources: [workCalendar()],
      timeZone: STOCKHOLM,
    });

    expect([...outcome.blockedDates]).toEqual(["2026-08-04"]);
    expect(outcome.applied).toEqual([
      { date: "2026-08-04", sourceId: WORK, minutes: 480, effect: "block" },
    ]);
  });

  it("counts each calendar separately — a lecture does not push work over the line", () => {
    // Three hours of lectures and three of work is a six-hour day, but neither
    // calendar reaches six on its own, so nothing is blocked.
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "lecture",
          sourceId: UNIVERSITY,
          start: local("2026-08-04", "08:00"),
          end: local("2026-08-04", "11:00"),
        }),
        fixedEvent({
          id: "work",
          sourceId: WORK,
          start: local("2026-08-04", "13:00"),
          end: local("2026-08-04", "16:00"),
        }),
      ],
      calendarSources: [workCalendar(), { id: UNIVERSITY, dayEffect: "none", thresholdMinutes: 360, reducedDailyMinutes: 0 }],
      timeZone: STOCKHOLM,
    });

    expect(outcome.blockedDates.size).toBe(0);
  });

  it("adds up several shifts on the same day", () => {
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "morning",
          sourceId: WORK,
          start: local("2026-08-04", "08:00"),
          end: local("2026-08-04", "12:00"),
        }),
        fixedEvent({
          id: "afternoon",
          sourceId: WORK,
          start: local("2026-08-04", "13:00"),
          end: local("2026-08-04", "16:00"),
        }),
      ],
      calendarSources: [workCalendar()],
      timeZone: STOCKHOLM,
    });

    // 4h + 3h = 7h, over the six-hour threshold even though neither is alone.
    expect([...outcome.blockedDates]).toEqual(["2026-08-04"]);
  });

  it("charges a multi-day event to every day it covers", () => {
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "conference",
          sourceId: WORK,
          start: local("2026-08-04", "09:00"),
          end: local("2026-08-06", "17:00"),
        }),
      ],
      calendarSources: [workCalendar()],
      timeZone: STOCKHOLM,
    });

    expect([...outcome.blockedDates].sort()).toEqual(["2026-08-04", "2026-08-05", "2026-08-06"]);
  });

  it("does not spill onto the next day when an event ends at midnight", () => {
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "late-shift",
          sourceId: WORK,
          start: local("2026-08-04", "16:00"),
          end: local("2026-08-05", "00:00"),
        }),
      ],
      calendarSources: [workCalendar()],
      timeZone: STOCKHOLM,
    });

    expect([...outcome.blockedDates]).toEqual(["2026-08-04"]);
  });

  it("blocks the whole local day across a daylight-saving change", () => {
    // 25 October 2026: Stockholm goes back an hour, so the local day is 25
    // hours long. An office shift that day must still take all of it.
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "office",
          sourceId: WORK,
          start: toEpochMinutes("2026-10-25T07:00:00.000Z"),
          end: toEpochMinutes("2026-10-25T15:00:00.000Z"),
        }),
      ],
      calendarSources: [workCalendar()],
      timeZone: STOCKHOLM,
    });

    expect([...outcome.blockedDates]).toEqual(["2026-10-25"]);

    const [interval] = outcome.blockedIntervals;
    expect(interval && interval.end - interval.start).toBe(25 * 60);
  });

  it("takes the strictest cap when two calendars claim the same day", () => {
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "work",
          sourceId: WORK,
          start: local("2026-08-04", "09:00"),
          end: local("2026-08-04", "16:00"),
        }),
        fixedEvent({
          id: "other",
          sourceId: "source-other",
          start: local("2026-08-04", "17:00"),
          end: local("2026-08-04", "23:00"),
        }),
      ],
      calendarSources: [
        workCalendar({ dayEffect: "reduce", reducedDailyMinutes: 60 }),
        { id: "source-other", dayEffect: "reduce", thresholdMinutes: 300, reducedDailyMinutes: 30 },
      ],
      timeZone: STOCKHOLM,
    });

    expect(outcome.capByDate.get("2026-08-04")).toBe(30);
  });

  it("leaves events with no calendar alone", () => {
    const outcome = applyDayEffects({
      fixedEvents: [
        fixedEvent({
          id: "manual",
          sourceId: null,
          start: local("2026-08-04", "08:00"),
          end: local("2026-08-04", "18:00"),
        }),
      ],
      calendarSources: [workCalendar()],
      timeZone: STOCKHOLM,
    });

    expect(outcome.blockedDates.size).toBe(0);
  });
});

describe("buildAvailability with a blocked day", () => {
  it("leaves no window at all on a day the office has taken", () => {
    // Placement is also stopped by the day's cap of zero, so this asserts the
    // *windows* directly: anything reading availability — the scorer, the
    // "no time at all" warning — must see the day as gone too.
    const availability = buildAvailability({
      horizonStartDate: "2026-08-03",
      horizonEndDate: "2026-08-07",
      timeZone: STOCKHOLM,
      preferences: preferences(),
      availabilityRules: [],
      calendarSources: [workCalendar()],
      fixedEvents: [
        fixedEvent({
          id: "office",
          sourceId: WORK,
          start: local("2026-08-04", "09:00"),
          end: local("2026-08-04", "17:00"),
        }),
      ],
      now: local("2026-08-03", "06:00"),
    });

    const dates = availability.windows.map((w) => epochMinutesToLocalDate(w.start, STOCKHOLM));
    expect(dates).not.toContain("2026-08-04");
    expect(availability.minutesByDate.get("2026-08-04")).toBeUndefined();
    // The days around it are untouched.
    expect(dates).toContain("2026-08-05");
  });
});

describe("capacityWithDayCaps", () => {
  it("counts a reduced day at its cap, not at its free hours", () => {
    const windows = [
      { start: local("2026-08-04", "08:00"), end: local("2026-08-04", "20:00") },
      { start: local("2026-08-05", "08:00"), end: local("2026-08-05", "12:00") },
    ];

    const capped = capacityWithDayCaps(
      windows,
      new Map([["2026-08-04", 30]]),
      STOCKHOLM,
    );

    // 30 for the working day instead of its twelve free hours, plus the four
    // real hours of the day after.
    expect(capped).toBe(30 + 240);
  });
});

describe("generatePlan with a work calendar", () => {
  const twoTasks = [
    task({ id: "task-1", estimatedMinutes: 180, deadline: local("2026-08-07", "17:00") }),
    task({ id: "task-2", estimatedMinutes: 180, deadline: local("2026-08-07", "17:00") }),
  ];

  it("plans nothing on a blocked working day, and moves the work elsewhere", () => {
    const plan = generatePlan(
      input({
        tasks: twoTasks,
        calendarSources: [workCalendar()],
        fixedEvents: [
          fixedEvent({
            id: "office",
            sourceId: WORK,
            start: local("2026-08-04", "09:00"),
            end: local("2026-08-04", "17:00"),
          }),
        ],
      }),
    );

    expect(daysWithSessions(plan.sessions)).not.toContain("2026-08-04");
    // The work did not vanish; it went to other days.
    expect(plan.sessions.length).toBeGreaterThan(0);
  });

  it("still studies on a day with only a short meeting", () => {
    const plan = generatePlan(
      input({
        tasks: twoTasks,
        calendarSources: [workCalendar()],
        fixedEvents: [
          fixedEvent({
            id: "standup",
            sourceId: WORK,
            start: local("2026-08-04", "09:00"),
            end: local("2026-08-04", "09:45"),
          }),
        ],
      }),
    );

    expect(daysWithSessions(plan.sessions)).toContain("2026-08-04");
  });

  it("keeps a reduced day inside its cap", () => {
    const plan = generatePlan(
      input({
        tasks: twoTasks,
        preferences: preferences({ minimumSessionMinutes: 30 }),
        calendarSources: [workCalendar({ dayEffect: "reduce", reducedDailyMinutes: 60 })],
        fixedEvents: [
          fixedEvent({
            id: "office",
            sourceId: WORK,
            start: local("2026-08-04", "09:00"),
            end: local("2026-08-04", "17:00"),
          }),
        ],
      }),
    );

    const minutes = plan.sessions
      .filter((s) => epochMinutesToLocalDate(s.start, STOCKHOLM) === "2026-08-04")
      .reduce((sum, s) => sum + s.minutes, 0);

    expect(minutes).toBeLessThanOrEqual(60);
  });

  it("says out loud that days were taken", () => {
    const plan = generatePlan(
      input({
        tasks: twoTasks,
        calendarSources: [workCalendar()],
        fixedEvents: [
          fixedEvent({
            id: "office-tue",
            sourceId: WORK,
            start: local("2026-08-04", "09:00"),
            end: local("2026-08-04", "17:00"),
          }),
          fixedEvent({
            id: "office-wed",
            sourceId: WORK,
            start: local("2026-08-05", "09:00"),
            end: local("2026-08-05", "17:00"),
          }),
        ],
      }),
    );

    const warning = plan.warnings.find((w) => w.code === "days_taken_by_commitments");
    expect(warning).toBeDefined();
    expect(warning?.details).toMatchObject({ blocked: 2, reduced: 0 });
  });

  it("changes nothing when no calendar carries a rule", () => {
    const withoutRules = generatePlan(
      input({
        tasks: twoTasks,
        calendarSources: [],
        fixedEvents: [
          fixedEvent({
            id: "office",
            sourceId: WORK,
            start: local("2026-08-04", "09:00"),
            end: local("2026-08-04", "17:00"),
          }),
        ],
      }),
    );

    // The hours are still blocked as an ordinary event, so the evening remains.
    expect(daysWithSessions(withoutRules.sessions)).toContain("2026-08-04");
  });
});
