import { describe, expect, it } from "vitest";

import {
  addMinutes,
  minutesBetween,
  utcToLocalDate,
  utcToWallClock,
  wallClockToUtc,
} from "@/lib/calendar/time";

/**
 * Time zone and daylight-saving behaviour.
 *
 * These run before anything depends on them because a silent one-hour drift is
 * the single most likely way for this product to quietly ruin someone's
 * schedule — and it would only show up twice a year.
 */

const STOCKHOLM = "Europe/Stockholm";
const NEW_YORK = "America/New_York";

describe("wallClockToUtc", () => {
  it("applies the summer offset (CEST, UTC+2)", () => {
    expect(wallClockToUtc("2026-08-01T17:00", STOCKHOLM)).toBe("2026-08-01T15:00:00.000Z");
  });

  it("applies the winter offset (CET, UTC+1)", () => {
    expect(wallClockToUtc("2026-01-15T17:00", STOCKHOLM)).toBe("2026-01-15T16:00:00.000Z");
  });

  it("uses the offset in force on that date, not today's", () => {
    // Same wall-clock time, six months apart, must map to different instants.
    const summer = wallClockToUtc("2026-07-01T09:00", STOCKHOLM);
    const winter = wallClockToUtc("2026-12-01T09:00", STOCKHOLM);
    expect(summer).not.toBe(winter);
    expect(summer).toBe("2026-07-01T07:00:00.000Z");
    expect(winter).toBe("2026-12-01T08:00:00.000Z");
  });

  it("handles a zone west of UTC", () => {
    expect(wallClockToUtc("2026-08-01T09:00", NEW_YORK)).toBe("2026-08-01T13:00:00.000Z");
  });

  it("rejects malformed input instead of guessing", () => {
    expect(wallClockToUtc("not a date", STOCKHOLM)).toBeNull();
    expect(wallClockToUtc("2026-08-01", STOCKHOLM)).toBeNull();
    expect(wallClockToUtc("", STOCKHOLM)).toBeNull();
  });
});

describe("round trip", () => {
  it("returns the original wall clock", () => {
    for (const local of ["2026-03-15T08:30", "2026-08-01T17:00", "2026-12-24T23:59"]) {
      const utc = wallClockToUtc(local, STOCKHOLM);
      expect(utc).not.toBeNull();
      expect(utcToWallClock(utc!, STOCKHOLM)).toBe(local);
    }
  });

  it("survives the spring-forward transition", () => {
    // Sweden springs forward 2026-03-29 at 02:00 local.
    const before = wallClockToUtc("2026-03-29T01:30", STOCKHOLM);
    const after = wallClockToUtc("2026-03-29T03:30", STOCKHOLM);
    expect(before).toBe("2026-03-29T00:30:00.000Z");
    expect(after).toBe("2026-03-29T01:30:00.000Z");
    // Only one real hour passes between them, despite two hours on the clock.
    expect(minutesBetween(before!, after!)).toBe(60);
  });

  it("survives the autumn fall-back transition", () => {
    // Sweden falls back 2026-10-25 at 03:00 local.
    const before = wallClockToUtc("2026-10-25T01:30", STOCKHOLM);
    const after = wallClockToUtc("2026-10-25T03:30", STOCKHOLM);
    // Three clock hours apart, but the repeated hour makes it three real hours.
    expect(minutesBetween(before!, after!)).toBe(180);
  });
});

describe("utcToLocalDate", () => {
  it("reports the local calendar day, not the UTC one", () => {
    // 22:30 UTC is already the next day in Stockholm.
    expect(utcToLocalDate("2026-08-01T22:30:00.000Z", STOCKHOLM)).toBe("2026-08-02");
    // ...and still the previous day in New York.
    expect(utcToLocalDate("2026-08-01T02:30:00.000Z", NEW_YORK)).toBe("2026-07-31");
  });
});

describe("minutesBetween / addMinutes", () => {
  it("measures and shifts instants", () => {
    expect(minutesBetween("2026-08-01T10:00:00.000Z", "2026-08-01T11:30:00.000Z")).toBe(90);
    expect(minutesBetween("2026-08-01T11:30:00.000Z", "2026-08-01T10:00:00.000Z")).toBe(-90);
    expect(addMinutes("2026-08-01T10:00:00.000Z", 45)).toBe("2026-08-01T10:45:00.000Z");
  });

  it("counts real elapsed time across a DST boundary", () => {
    // A 90-minute session starting before spring-forward still lasts 90 minutes.
    const start = wallClockToUtc("2026-03-29T01:00", STOCKHOLM)!;
    const end = addMinutes(start, 90);
    expect(minutesBetween(start, end)).toBe(90);
    // On the clock it appears to end at 03:30, because 02:00–03:00 never happened.
    expect(utcToWallClock(end, STOCKHOLM)).toBe("2026-03-29T03:30");
  });
});
