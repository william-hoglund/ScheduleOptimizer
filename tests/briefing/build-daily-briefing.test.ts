import { describe, expect, it } from "vitest";

import {
  buildDailyBriefing,
  greetingBandFor,
  type DailyBriefingEvent,
  type DailyBriefingSession,
} from "@/lib/briefing/build-daily-briefing";
import type { HorizonForecast } from "@/lib/intelligence/workload-forecast";

function session(overrides: Partial<DailyBriefingSession> = {}): DailyBriefingSession {
  return {
    title: "Session",
    courseId: "course-1",
    startAt: "2026-08-05T09:00:00.000Z",
    endAt: "2026-08-05T10:00:00.000Z",
    plannedMinutes: 60,
    ...overrides,
  };
}

function event(overrides: Partial<DailyBriefingEvent> = {}): DailyBriefingEvent {
  return {
    title: "Event",
    startAt: "2026-08-05T09:00:00.000Z",
    endAt: "2026-08-05T10:00:00.000Z",
    eventType: "other",
    isFixed: true,
    ...overrides,
  };
}

function forecast(overrides: Partial<HorizonForecast> = {}): HorizonForecast {
  return {
    horizonDays: 7,
    requiredMinutes: 100,
    availableMinutes: 200,
    shortfallMinutes: 0,
    pressure: "normal",
    mainReason: null,
    remedies: [],
    ...overrides,
  };
}

describe("greetingBandFor", () => {
  it("is morning before noon", () => {
    expect(greetingBandFor(0)).toBe("morning");
    expect(greetingBandFor(11)).toBe("morning");
  });

  it("is afternoon from noon up to (not including) 18", () => {
    expect(greetingBandFor(12)).toBe("afternoon");
    expect(greetingBandFor(17)).toBe("afternoon");
  });

  it("is evening from 18 onward", () => {
    expect(greetingBandFor(18)).toBe("evening");
    expect(greetingBandFor(23)).toBe("evening");
  });
});

describe("buildDailyBriefing", () => {
  it("caps the focus list and keeps it chronological", () => {
    const briefing = buildDailyBriefing({
      sessions: [
        session({ title: "Third", startAt: "2026-08-05T15:00:00.000Z" }),
        session({ title: "First", startAt: "2026-08-05T08:00:00.000Z" }),
        session({ title: "Second", startAt: "2026-08-05T11:00:00.000Z" }),
        session({ title: "Fourth", startAt: "2026-08-05T18:00:00.000Z" }),
      ],
      eventsToday: [],
      availableMinutesToday: 0,
      sevenDayForecast: null,
    });

    expect(briefing.focusSessions.map((s) => s.title)).toEqual(["First", "Second", "Third"]);
  });

  it("reports nothing scheduled when there are no sessions", () => {
    const briefing = buildDailyBriefing({
      sessions: [],
      eventsToday: [],
      availableMinutesToday: 120,
      sevenDayForecast: null,
    });
    expect(briefing.focusSessions).toEqual([]);
    expect(briefing.plannedMinutesToday).toBe(0);
  });

  it("only lists fixed events as today's commitments, not movable ones", () => {
    const briefing = buildDailyBriefing({
      sessions: [],
      eventsToday: [event({ title: "Work", isFixed: true }), event({ title: "Movable", isFixed: false })],
      availableMinutesToday: 0,
      sevenDayForecast: null,
    });
    expect(briefing.fixedEventsToday.map((e) => e.title)).toEqual(["Work"]);
  });

  it("picks the first personal fixed event to protect, ignoring other types", () => {
    const briefing = buildDailyBriefing({
      sessions: [],
      eventsToday: [
        event({ title: "Lecture", eventType: "lecture", isFixed: true }),
        event({ title: "Pilates", eventType: "personal", isFixed: true, startAt: "2026-08-05T18:30:00.000Z" }),
        event({ title: "Dinner", eventType: "personal", isFixed: true, startAt: "2026-08-05T20:00:00.000Z" }),
      ],
      availableMinutesToday: 0,
      sevenDayForecast: null,
    });
    expect(briefing.protect).toEqual({ title: "Pilates", startAt: "2026-08-05T18:30:00.000Z" });
  });

  it("has nothing to protect when no personal event exists today", () => {
    const briefing = buildDailyBriefing({
      sessions: [],
      eventsToday: [event({ eventType: "lecture" })],
      availableMinutesToday: 0,
      sevenDayForecast: null,
    });
    expect(briefing.protect).toBeNull();
  });

  it("shows no watch-out line when the week is on track", () => {
    const briefing = buildDailyBriefing({
      sessions: [],
      eventsToday: [],
      availableMinutesToday: 0,
      sevenDayForecast: forecast({ pressure: "normal" }),
    });
    expect(briefing.watchOut).toBeNull();
  });

  it("surfaces the forecast's reason once pressure rises above normal", () => {
    const reason = { code: "insufficient_time" as const };
    const briefing = buildDailyBriefing({
      sessions: [],
      eventsToday: [],
      availableMinutesToday: 0,
      sevenDayForecast: forecast({ pressure: "high", mainReason: reason }),
    });
    expect(briefing.watchOut).toEqual(reason);
  });

  it("has no watch-out line when there is no forecast at all", () => {
    const briefing = buildDailyBriefing({
      sessions: [],
      eventsToday: [],
      availableMinutesToday: 0,
      sevenDayForecast: null,
    });
    expect(briefing.watchOut).toBeNull();
  });
});
