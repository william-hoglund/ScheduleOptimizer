import { describe, expect, it } from "vitest";

import { scoreSlot, type SlotContext } from "@/lib/planner/scoring/score-slot";
import type { Interval } from "@/lib/planner/types";
import { MONDAY_0600, STOCKHOLM, local, preferences, task } from "./helpers";

/**
 * The scoring terms, tested in isolation.
 *
 * The integrated engine tests prove the *plan* is right. These prove each
 * individual preference actually pulls in the direction it claims to — which
 * matters because a term can be quietly inert inside the full engine, out-voted
 * by something with a heavier weight, and still be the thing that saves a plan
 * once the weights or the student's settings change.
 */

function context(overrides: Partial<SlotContext> = {}): SlotContext {
  return {
    now: MONDAY_0600,
    timeZone: STOCKHOLM,
    preferences: preferences({ earliestStartTime: "08:00", latestEndTime: "23:00" }),
    preferredWindows: [],
    placed: [],
    minutesByDate: new Map(),
    window: { start: local("2026-08-03", "08:00"), end: local("2026-08-03", "23:00") },
    dailyPaceTarget: 240,
    ...overrides,
  };
}

function slotAt(time: string, minutes = 60): Interval {
  const start = local("2026-08-03", time);
  return { start, end: start + minutes };
}

function scoreAt(time: string, opts: { context?: Partial<SlotContext>; difficulty?: number } = {}) {
  return scoreSlot(slotAt(time), task({ difficulty: opts.difficulty ?? 3, deadline: null }), {
    targetDeadline: null,
    chunkIndex: 0,
    totalChunks: 1,
    context: context(opts.context),
  }).score;
}

describe("late-hours penalty", () => {
  it("scores a late-evening slot below an identical earlier one", () => {
    // Same day, same length, same everything except the hour.
    expect(scoreAt("22:00")).toBeLessThan(scoreAt("18:00"));
  });

  it("gets steadily worse the later it runs", () => {
    const early = scoreAt("19:00");
    const late = scoreAt("21:30");
    const latest = scoreAt("22:30");

    expect(late).toBeLessThan(early);
    expect(latest).toBeLessThan(late);
  });

  it("does not penalise anything finishing by 21:00", () => {
    // 19:45 + 60 min ends exactly at 20:45, inside the threshold.
    expect(scoreAt("19:45")).toBeGreaterThan(scoreAt("21:00"));
  });
});

describe("energy matching", () => {
  it("prefers high-energy hours for difficult work", () => {
    const morningPerson = {
      preferences: preferences({
        earliestStartTime: "08:00",
        latestEndTime: "23:00",
        energyProfile: { morning: "high" as const, afternoon: "low" as const, evening: "low" as const },
      }),
    };

    const morning = scoreAt("09:00", { context: morningPerson, difficulty: 5 });
    const afternoon = scoreAt("14:00", { context: morningPerson, difficulty: 5 });

    expect(morning).toBeGreaterThan(afternoon);
  });

  it("matters less for easy work than hard work", () => {
    const morningPerson = {
      preferences: preferences({
        earliestStartTime: "08:00",
        latestEndTime: "23:00",
        energyProfile: { morning: "high" as const, afternoon: "low" as const, evening: "low" as const },
      }),
    };

    const hardGap =
      scoreAt("09:00", { context: morningPerson, difficulty: 5 }) -
      scoreAt("14:00", { context: morningPerson, difficulty: 5 });
    const easyGap =
      scoreAt("09:00", { context: morningPerson, difficulty: 1 }) -
      scoreAt("14:00", { context: morningPerson, difficulty: 1 });

    expect(hardGap).toBeGreaterThan(easyGap);
  });
});

describe("pacing and overload", () => {
  it("penalises a day already carrying more than its share", () => {
    const light = scoreAt("14:00", { context: { minutesByDate: new Map([["2026-08-03", 0]]) } });
    const heavy = scoreAt("14:00", {
      context: { minutesByDate: new Map([["2026-08-03", 400]]) },
    });

    expect(heavy).toBeLessThan(light);
  });
});

describe("explicit preferred windows", () => {
  it("rewards a slot the student marked as preferred", () => {
    const preferredWindow = {
      start: local("2026-08-03", "14:00"),
      end: local("2026-08-03", "16:00"),
    };

    const inside = scoreAt("14:00", { context: { preferredWindows: [preferredWindow] } });
    const outside = scoreAt("14:00", { context: { preferredWindows: [] } });

    expect(inside).toBeGreaterThan(outside);
  });
});

describe("fragmentation", () => {
  it("avoids leaving an unusable sliver at the edge of a window", () => {
    // A window of exactly 80 minutes: a 60-minute block starting at the top
    // leaves 20 minutes, which is below the 30-minute minimum and therefore dead.
    const tight = {
      window: { start: local("2026-08-03", "14:00"), end: local("2026-08-03", "15:20") },
    };
    const roomy = {
      window: { start: local("2026-08-03", "14:00"), end: local("2026-08-03", "18:00") },
    };

    expect(scoreAt("14:00", { context: tight })).toBeLessThan(
      scoreAt("14:00", { context: roomy }),
    );
  });
});
