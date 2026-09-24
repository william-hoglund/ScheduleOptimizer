import { describe, expect, it } from "vitest";

import { clashingEventIds, findClashes, type ClashEvent } from "@/lib/calendar/detect-clashes";

function event(overrides: Partial<ClashEvent> & Pick<ClashEvent, "id">): ClashEvent {
  return {
    title: "Lecture",
    startIso: "2026-08-04T08:00:00.000Z",
    endIso: "2026-08-04T10:00:00.000Z",
    sourceId: "mech-eng",
    isFixed: true,
    isAllDay: false,
    ...overrides,
  };
}

describe("findClashes", () => {
  it("finds two lectures from different programmes at the same hour", () => {
    const clashes = findClashes([
      event({ id: "mech", title: "Thermodynamics", sourceId: "mech-eng" }),
      event({
        id: "econ",
        title: "Microeconomics",
        sourceId: "economics",
        startIso: "2026-08-04T09:00:00.000Z",
        endIso: "2026-08-04T11:00:00.000Z",
      }),
    ]);

    expect(clashes).toHaveLength(1);
    expect(clashes[0]?.acrossCalendars).toBe(true);
    expect(clashes[0]?.overlapMinutes).toBe(60);
    expect(clashingEventIds(clashes)).toEqual(new Set(["mech", "econ"]));
  });

  it("says when a clash is inside one calendar", () => {
    const clashes = findClashes([
      event({ id: "a" }),
      event({ id: "b", startIso: "2026-08-04T09:00:00.000Z" }),
    ]);

    expect(clashes[0]?.acrossCalendars).toBe(false);
  });

  it("does not call back-to-back events a clash", () => {
    const clashes = findClashes([
      event({ id: "first", endIso: "2026-08-04T10:00:00.000Z" }),
      event({
        id: "second",
        startIso: "2026-08-04T10:00:00.000Z",
        endIso: "2026-08-04T12:00:00.000Z",
      }),
    ]);

    expect(clashes).toHaveLength(0);
  });

  it("ignores movable events — they are not commitments", () => {
    const clashes = findClashes([
      event({ id: "fixed" }),
      event({ id: "movable", isFixed: false, startIso: "2026-08-04T09:00:00.000Z" }),
    ]);

    expect(clashes).toHaveLength(0);
  });

  it("ignores all-day markers, which would otherwise clash with everything", () => {
    const clashes = findClashes([
      event({
        id: "term",
        isAllDay: true,
        startIso: "2026-08-04T00:00:00.000Z",
        endIso: "2026-08-05T00:00:00.000Z",
      }),
      event({ id: "lecture" }),
    ]);

    expect(clashes).toHaveLength(0);
  });

  it("reports every pair when three events overlap", () => {
    const clashes = findClashes([
      event({ id: "a", endIso: "2026-08-04T12:00:00.000Z" }),
      event({ id: "b", startIso: "2026-08-04T09:00:00.000Z", endIso: "2026-08-04T12:00:00.000Z" }),
      event({ id: "c", startIso: "2026-08-04T09:30:00.000Z", endIso: "2026-08-04T12:00:00.000Z" }),
    ]);

    expect(clashes).toHaveLength(3);
  });

  it("does not compare events that are nowhere near each other", () => {
    const clashes = findClashes([
      event({ id: "monday" }),
      event({
        id: "friday",
        startIso: "2026-08-07T08:00:00.000Z",
        endIso: "2026-08-07T10:00:00.000Z",
      }),
    ]);

    expect(clashes).toHaveLength(0);
  });
});
